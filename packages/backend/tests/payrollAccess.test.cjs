const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { Client } = require('pg');
const express = require('express');

const testDatabase = process.env.PAYROLL_API_TEST_ADMIN_URL;

test('payroll routes isolate companies and manage access, engagements and effective dates', { skip: !testDatabase }, async () => {
  const { db } = require('../dist/config/database');
  const companies = require('../dist/routes/companies').default;
  const admin = new Client({ connectionString: testDatabase });
  const storage = await mkdtemp(join(tmpdir(), 'payroll-files-'));
  process.env.PAYROLL_STORAGE_DIRECTORY = storage;

  const ids = Object.fromEntries([
    'tenant', 'officeA', 'officeB', 'companyA', 'companyB', 'owner', 'attendant',
    'person', 'engagement', 'input', 'document', 'storage',
  ].map(key => [key, randomUUID()]));
  const fileBytes = Buffer.from('%PDF-1.4\npayroll attachment fixture');
  const suffix = ids.tenant.slice(0, 8);
  let server;

  try {
    await admin.connect();
    await admin.query('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [ids.tenant, 'Payroll Test', `payroll-${suffix}`]);
    await admin.query(
      "INSERT INTO users (id, tenant_id, name, email, password, role) VALUES ($1, $2, 'Owner', $3, 'unused', 'owner'), ($4, $2, 'Attendant', $5, 'unused', 'attendant')",
      [ids.owner, ids.tenant, `owner-${suffix}@example.test`, ids.attendant, `attendant-${suffix}@example.test`],
    );
    await admin.query(
      "INSERT INTO offices (id, tenant_id, name, cnpj) VALUES ($1, $2, 'A', $3), ($4, $2, 'B', $5)",
      [ids.officeA, ids.tenant, `10${suffix}0001`, ids.officeB, `20${suffix}0001`],
    );
    await admin.query('INSERT INTO office_accesses (tenant_id, office_id, user_id) VALUES ($1, $2, $3)', [ids.tenant, ids.officeA, ids.attendant]);
    await admin.query(
      `INSERT INTO companies (id, tenant_id, office_id, identification_type, tax_id, name) VALUES
       ($1, $2, $3, 'cnpj', '04252011000110', 'Customer A'), ($4, $2, $3, 'cnpj', '04252011000210', 'Customer B')`,
      [ids.companyA, ids.tenant, ids.officeA, ids.companyB],
    );
    const scope = [ids.tenant, ids.officeA, ids.companyA];
    await admin.query(
      "INSERT INTO company_tax_periods (tenant_id, office_id, company_id, tax_regime, start_date) VALUES ($1, $2, $3, 'simples_nacional', '2026-01-01')",
      scope,
    );
    await admin.query(
      "INSERT INTO payroll_people (id, tenant_id, office_id, company_id, full_name, cpf) VALUES ($1, $2, $3, $4, 'Fixture', '52998224725')",
      [ids.person, ...scope],
    );
    await admin.query(
      "INSERT INTO payroll_engagements (id, tenant_id, office_id, company_id, person_id, kind) VALUES ($1, $2, $3, $4, $5, 'employee')",
      [ids.engagement, ...scope, ids.person],
    );
    await admin.query(
      "INSERT INTO payroll_inputs (id, tenant_id, office_id, company_id, engagement_id, kind, starts_on, value) VALUES ($1, $2, $3, $4, $5, 'leave', '2026-11-01', '{}')",
      [ids.input, ...scope, ids.engagement],
    );
    await admin.query(
      "INSERT INTO payroll_documents (id, tenant_id, office_id, company_id, input_id, kind, storage_key, content_type) VALUES ($1, $2, $3, $4, $5, 'health_attachment', $6, 'application/pdf')",
      [ids.document, ...scope, ids.input, ids.storage],
    );
    await writeFile(join(storage, ids.storage), fileBytes);

    const app = express();
    app.use(express.json(), (request, _response, next) => {
      const role = request.header('X-Test-Role') === 'owner' ? 'owner' : 'attendant';
      request.user = { tenantId: ids.tenant, userId: ids[role], role };
      next();
    });
    app.use('/companies', companies);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    function get(companyId, suffix = '', { role = 'attendant', office = ids.officeA } = {}) {
      return fetch(`${origin}/companies/${companyId}/payroll${suffix}`, {
        headers: { 'X-Test-Role': role, 'X-Office-Id': office },
      });
    }
    function grant(permissions, role = 'owner') {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/access/${ids.attendant}`, {
        method: 'PUT', headers: { 'X-Test-Role': role, 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
    }

    const document = `/documents/${ids.document}`;
    assert.equal((await get(ids.companyA)).status, 403);
    assert.equal((await grant(['read'])).status, 200);
    assert.equal((await get(ids.companyA)).status, 200);
    assert.equal((await get(ids.companyB)).status, 403);
    assert.equal((await get(ids.companyA, document, { role: 'owner', office: ids.officeB })).status, 404);
    assert.equal((await get(ids.companyB, document, { role: 'owner' })).status, 404);
    assert.equal((await get(ids.companyA, document)).status, 404);
    assert.equal((await grant(['read', 'health_documents'], 'attendant')).status, 403);
    assert.equal((await grant(['read', 'health_documents'])).status, 200);

    const downloaded = await get(ids.companyA, document);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), fileBytes);
    const audit = await admin.query("SELECT actor_id FROM payroll_audits WHERE action = 'read_health_document' AND target_id = $1", [ids.document]);
    assert.deepEqual(audit.rows, [{ actor_id: ids.attendant }]);

    async function save(relativePath, body = {}, method = 'POST') {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/people${relativePath}`, {
        method, headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const employee = {
      person: { cpf: '111.444.777-35', fullName: 'New Worker', birthDate: '1990-04-09', details: {
        sex: 'F', raceColor: '1', education: '09', birthCountry: '105', nationality: '105',
        postalCode: '01001-000', street: 'Praça de Referência', streetNumber: '1', municipalityCode: '3550308', state: 'SP',
      } },
      registration: 'employee-test-001', categoryCode: '101', startsOn: '2026-11-01',
      establishmentRegistration: '04252011000110', taxAllocationCode: 'LOT01',
      details: { admissionType: '1', admissionIndicator: '1', workRegime: '1', socialSecurityRegime: '1',
        jobTitle: 'Assistente', occupationCode: '411010', contractType: '1', unionRegistration: '04252011000110',
        workTimeRegime: '1', activityNature: '1', journeyType: '5', weeklyHours: '40', monthlyHoursDivisor: '200', schedule: 'Segunda a sexta, 8h às 17h, intervalo 12h às 13h', partTimeType: '0', nightWork: 'N' },
    };
    const created = await save('/employee', employee);
    assert.equal(created.status, 201);
    const draft = await created.json();
    assert.equal(draft.status, 'draft');
    const employeePath = '/employee/' + draft.id;
    const admissionPath = '/esocial/restricted/registration' + employeePath + '/xml';
    assert.equal((await get(ids.companyA, admissionPath, { role: 'owner' })).status, 422);
    const pending = await save(employeePath + '/validate');
    assert.equal(pending.status, 422);
    assert.ok((await pending.json()).fields.compensation);
    assert.equal((await save('/employee', employee)).status, 409);

    let compensation = await save(employeePath + '/compensation', { amount: '2400,00', startsOn: '2026-11-01', unit: 'month' });
    assert.equal(compensation.status, 200);
    assert.equal((await (await save(employeePath + '/validate')).json()).status, 'active');
    compensation = await save(employeePath + '/compensation', { amount: '2600.25', startsOn: '2026-12-01', unit: 'month' });
    assert.equal(compensation.status, 200);
    assert.deepEqual((await compensation.json()).compensation.map(({ amount, startsOn, endsOn }) => [amount, startsOn, endsOn]), [
      ['2600.25', '2026-12-01', null], ['2400.00', '2026-11-01', '2026-11-30'],
    ]);
    const admission = await get(ids.companyA, admissionPath, { role: 'owner' });
    assert.equal(admission.status, 200);
    assert.equal(admission.headers.get('Cache-Control'), 'private, no-store');
    const admissionDraft = await admission.json();
    assert.equal(admissionDraft.draft, true);
    assert.match(admissionDraft.xml, /<vrSalFx>2400.00<\/vrSalFx>/);
    assert.doesNotMatch(admissionDraft.xml, /<perApur>/);
    assert.equal((await get(ids.companyB, admissionPath, { role: 'owner' })).status, 404);
    assert.equal((await get(ids.companyA, admissionPath)).status, 403);

    const partnerResponse = await save('/partner', {
      person: employee.person, startsOn: '2026-11-01', details: { role: 'Administrador', paymentRule: 'Último dia útil', registerWithEsocial: 'no' },
    });
    assert.equal(partnerResponse.status, 201);
    const partner = await partnerResponse.json();
    assert.equal(partner.personId, draft.personId);
    assert.equal(partner.categoryCode, '723');
    const partnerPath = '/partner/' + partner.id;
    assert.equal((await save(partnerPath + '/compensation', { amount: '1800', startsOn: '2026-11-01', unit: 'month' })).status, 200);
    assert.equal((await (await save(partnerPath + '/validate')).json()).status, 'active');
    const registrationPath = '/esocial/restricted/registration' + partnerPath + '/xml';
    assert.equal((await get(ids.companyA, registrationPath, { role: 'owner' })).status, 422);
    assert.equal((await save(partnerPath, { person: employee.person, startsOn: '2026-11-01',
      details: { role: 'Administrador', paymentRule: 'Último dia útil', registerWithEsocial: 'yes' } }, 'PUT')).status, 200);
    const registeredPartner = await (await get(ids.companyA, registrationPath, { role: 'owner' })).json();
    assert.match(registeredPartner.xml, /<codCateg>723<\/codCateg>/);

    const dependent = { fullName: 'Dependent Test', cpf: '', birthDate: '2014-02-01', relationship: '03',
      startsOn: '2026-11-01', incomeTax: true, familyAllowance: true };
    const missingCpf = await save(employeePath + '/conditions/dependent', dependent);
    assert.equal(missingCpf.status, 422);
    assert.ok((await missingCpf.json()).fields.cpf);
    assert.equal((await save(employeePath + '/conditions/dependent', { ...dependent, cpf: '12345678909' })).status, 201);
    assert.equal((await save(employeePath + '/conditions/transport_voucher', {
      amount: '200', discountRule: 'percentage', discount: '6', startsOn: '2026-11-01',
    })).status, 201);
    assert.equal((await save(employeePath + '/conditions/transport_voucher', {
      amount: '210', discountRule: 'fixed', discount: '90', startsOn: '2026-12-01',
    })).status, 201);
    assert.equal((await save(partnerPath + '/conditions/other_source', {
      registrationType: 'cnpj', registration: '99.123.456/0001-50', categoryCode: '101', remuneration: '3050',
      contribution: '250', startsOn: '2026-12-01', endsOn: '2026-12-31',
    })).status, 201);
    const november = await (await get(ids.companyA, '/people' + employeePath + '/conditions?month=2026-11', { role: 'owner' })).json();
    const december = await (await get(ids.companyA, '/people' + employeePath + '/conditions?month=2026-12', { role: 'owner' })).json();
    const january = await (await get(ids.companyA, '/people' + employeePath + '/conditions?month=2027-01', { role: 'owner' })).json();
    assert.equal(november.dependents[0].fullName, 'Dependent Test');
    assert.deepEqual(november.records.map(row => [row.kind, row.value.amount, row.endsOn]), [['transport_voucher', '200', '2026-11-30']]);
    assert.deepEqual(december.records.map(row => [row.kind, row.value.amount || row.value.contribution]), [['other_source', '250'], ['transport_voucher', '210']]);
    assert.deepEqual(january.records.map(row => row.kind), ['transport_voucher']);

    function configure(body, policyId) {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/policies${policyId ? '/' + policyId : ''}`, {
        method: policyId ? 'PUT' : 'POST', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const salaryDay = { kind: 'business', monthOffset: 1, day: 5, weekdaysOnly: false };
    const first = { kind: 'fixed', monthOffset: 0, day: 15, weekdaysOnly: false };
    const rules = {
      salary: salaryDay, partner: { kind: 'last_business', monthOffset: 0, weekdaysOnly: true },
      advance: { date: first, unit: 'percentage', amount: '40' }, semimonthly: { cutoff: 15, first, second: salaryDay },
      calendars: [{ establishment: '04252011000110', holidays: ['2026-05-04'] }],
      calculation: { monthlyProration: 'calendar_days', employeeEmployerRate: '0', partnerEmployerRate: '0',
        partnerWithholdingRate: '11', reference: 'Parâmetros fictícios do teste de integração' },
    };
    const monthlyPolicy = await configure({ mode: 'monthly', startsOn: '2026-04-01', rules });
    assert.equal(monthlyPolicy.status, 201);
    assert.equal((await configure({ mode: 'monthly', startsOn: '2026-04-01', rules }, (await monthlyPolicy.json()).id)).status, 200);
    const commonSchedule = await (await get(ids.companyA, '/policies/calendar/2026-04', { role: 'owner' })).json();
    assert.equal(commonSchedule.deadline, '2026-05-07');
    const localSchedule = await (await get(ids.companyA, '/policies/calendar/2026-04?establishment=04252011000110', { role: 'owner' })).json();
    assert.equal(localSchedule.deadline, '2026-05-08');
    assert.equal(localSchedule.dates.find(row => row.kind === 'partner').dueOn, '2026-04-30');
    const advancePolicy = await configure({ mode: 'monthly_advance', startsOn: '2026-06-01', rules });
    assert.equal(advancePolicy.status, 201);
    const advanceId = (await advancePolicy.json()).id;
    assert.equal((await configure({ mode: 'semimonthly', startsOn: '2026-09-01', rules })).status, 422);
    const semiPolicy = await configure({ mode: 'semimonthly', startsOn: '2026-09-01', rules, agreementReference: 'Acordo de teste' });
    assert.equal(semiPolicy.status, 201);
    const semiId = (await semiPolicy.json()).id;
    const semi = await (await get(ids.companyA, '/policies/calendar/2026-09', { role: 'owner' })).json();
    assert.deepEqual(semi.dates.slice(0, 2).map(row => [row.kind, row.startsOn, row.endsOn]), [
      ['first_half', '2026-09-01', '2026-09-15'], ['second_half', '2026-09-16', '2026-09-30'],
    ]);

    async function createVersion(competence, policyId, authorizedBy) {
      const { rows: [period] } = await admin.query(
        'INSERT INTO payroll_periods (tenant_id, office_id, company_id, competence) VALUES ($1, $2, $3, $4) RETURNING id',
        [...scope, competence],
      );
      const { rows: [version] } = await admin.query(
        `INSERT INTO payroll_versions (tenant_id, office_id, company_id, period_id, policy_id, revision, source_digest,
            inputs, totals, approved_at, approved_by_user_id)
          VALUES ($1, $2, $3, $4, $5, 1, 'test', '{}', '{}', CASE WHEN $6::text IS NOT NULL THEN now() END, $6) RETURNING id`,
        [...scope, period.id, policyId, authorizedBy],
      );
      return version.id;
    }

    const advanceVersion = await createVersion('2026-07-01', advanceId, null);
    const { rows: [statement] } = await admin.query(
      `INSERT INTO payroll_statements (tenant_id, office_id, company_id, version_id, engagement_id, reference, kind,
        gross, deductions, net, employer_charges, items) VALUES ($1, $2, $3, $4, $5, 'ADV', 'advance', 100, 0, 100, 0, '[]') RETURNING id`,
      [...scope, advanceVersion, ids.engagement],
    );
    await admin.query(
      `INSERT INTO payroll_payments (tenant_id, office_id, company_id, statement_id, due_on, paid_on, amount, paid_amount, evidence_reference)
        VALUES ($1, $2, $3, $4, '2026-07-15', '2026-07-15', 100, 100, 'test')`,
      [...scope, statement.id],
    );
    assert.equal((await configure({ mode: 'monthly', startsOn: '2026-07-01', rules })).status, 409);
    assert.equal((await configure({ mode: 'monthly', startsOn: '2026-06-01', rules }, advanceId)).status, 409);
    await createVersion('2026-10-01', semiId, ids.owner);
    assert.equal((await configure({ mode: 'monthly', startsOn: '2026-10-01', rules })).status, 409);
    assert.equal((await configure({ mode: 'monthly', startsOn: '2026-11-01', rules })).status, 201);
    const extra = await fetch(`${origin}/companies/${ids.companyA}/payroll/periods/2026-11/inputs`, {
      method: 'POST', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ engagementId: draft.id, kind: 'overtime', date: '2026-11-14', hours: '10', premium: '50' }),
    });
    assert.equal(extra.status, 201);
    const preview = await (await get(ids.companyA, '/periods/2026-11/preview', { role: 'owner' })).json();
    assert.equal(preview.taxRegime, 'simples_nacional');
    assert.equal(preview.statements.find(row => row.kind === 'employee').totals.gross, '2580.00');
    assert.equal(preview.statements.find(row => row.kind === 'partner').totals.gross, '1800.00');
    assert.equal((await save(partnerPath + '/compensation', { amount: '4500', startsOn: '2026-12-01', unit: 'month' })).status, 200);
    const decemberPreview = await (await get(ids.companyA, '/periods/2026-12/preview', { role: 'owner' })).json();
    const partnerStatement = decemberPreview.statements.find(row => row.kind === 'partner');
    assert.equal(partnerStatement.totals.gross, '4500.00');
    assert.equal(partnerStatement.items.find(row => row.code === 'INSS').amount, '310.78');
    assert.equal(partnerStatement.items.some(row => row.code === 'FGTS'), false);
    const vacationWorker = await save('/employee', { ...employee,
      person: { ...employee.person, cpf: '12345678909', fullName: 'Vacation Worker' },
      registration: 'employee-test-002', startsOn: '2025-11-01' });
    assert.equal(vacationWorker.status, 201);
    const worker = await vacationWorker.json();
    const workerPath = '/employee/' + worker.id;
    assert.equal((await save(workerPath + '/compensation', { amount: '3000', startsOn: '2025-11-01', unit: 'month' })).status, 200);
    assert.equal((await save(workerPath + '/validate')).status, 200);
    function scheduleVacation(body) {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/vacations`, {
        method: 'POST', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const plan = { engagementId: worker.id, acquisitionStartsOn: '2025-11-01', acquisitionEndsOn: '2026-10-31',
      startsOn: '2026-11-23', endsOn: '2026-12-07', entitlementDays: 30 };
    assert.equal((await scheduleVacation({ ...plan, acquisitionEndsOn: '2026-10-01',
      startsOn: '2026-10-10', endsOn: '2026-10-24' })).status, 409);
    const vacation = await scheduleVacation(plan);
    assert.equal(vacation.status, 201);
    const savedVacation = await vacation.json();
    assert.equal(savedVacation.gross, '2000.00');
    const vacationPath = '/vacations/' + savedVacation.id;
    const leaveDraft = await (await get(ids.companyA, '/esocial/restricted/registration' + vacationPath + '/xml', { role: 'owner' })).json();
    assert.match(leaveDraft.xml, /<dtIniAfast>2026-11-23<\/dtIniAfast><codMotAfast>15<\/codMotAfast>/);
    assert.match(leaveDraft.xml, /<dtTermAfast>2026-12-07<\/dtTermAfast>/);
    const notice = await get(ids.companyA, vacationPath + '/documents/notice', { role: 'owner' });
    assert.equal(notice.status, 200);
    assert.match(await notice.text(), /Aviso de férias/);
    assert.equal((await get(ids.companyA, vacationPath + '/documents/receipt', { role: 'owner' })).status, 404);
    const unpaidVacation = await (await get(ids.companyA, '/periods/2026-11/preview', { role: 'owner' })).json();
    assert.equal(unpaidVacation.statements.some(row => row.engagementId === worker.id), false);
    assert.ok(unpaidVacation.issues.some(issue => issue.includes('confirme o pagamento de férias')));
    assert.equal((await fetch(`${origin}/companies/${ids.companyA}/payroll${vacationPath}/payment`, {
      method: 'PUT', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidOn: '2026-11-20', paidAmount: '1850', inss: '150', irrf: '0',
        otherDeductions: '0', evidenceReference: 'VACATION-PAYMENT' }),
    })).status, 200);
    const vacationReceipt = await get(ids.companyA, vacationPath + '/documents/receipt', { role: 'owner' });
    assert.match(await vacationReceipt.text(), /VACATION-PAYMENT/);
    assert.equal((await scheduleVacation({ ...plan, startsOn: '2026-12-02', endsOn: '2026-12-16' })).status, 409);
    let vacationPaid = 0;
    for (const [month, amount, worked, gross, counted] of [
      ['2026-11', '1066.67', '2200.00', '3266.67', '986.67'],
      ['2026-12', '933.33', '2322.58', '3255.91', '863.33'],
    ]) {
      const result = await (await get(ids.companyA, '/periods/' + month + '/preview', { role: 'owner' })).json();
      assert.equal(result.vacations[0].gross, amount);
      const statement = result.statements.find(row => row.engagementId === worker.id);
      assert.deepEqual(statement.issues, []);
      assert.equal(statement.totals.gross, gross);
      assert.equal(statement.totals.bases.inss, gross);
      assert.equal(statement.totals.bases.fgts, gross);
      assert.equal(statement.totals.bases.irrf, worked);
      const paid = statement.items.find(item => item.code === 'VACATION_PAID').amount;
      assert.equal(paid, counted);
      vacationPaid += Math.round(Number(paid) * 100);
      assert.equal(statement.payments[0].amount, statement.totals.net);
    }
    assert.equal(vacationPaid, 185000);
    const decemberDraftResponse = await fetch(`${origin}/companies/${ids.companyA}/payroll/periods/2026-12/versions`, {
      method: 'POST', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(decemberDraftResponse.status, 200);
    const decemberDraft = await decemberDraftResponse.json();
    const partnerDocument = await get(ids.companyA, '/periods/2026-12/versions/' + decemberDraft.id + '/documents/partner', { role: 'owner' });
    const partnerMarkup = await partnerDocument.text();
    assert.match(partnerMarkup, /Folha de pró-labore/);
    assert.match(partnerMarkup, /RASCUNHO/);

    function changeRun(path, body, role = 'owner') {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/periods/2026-05/${path}`, {
        method: 'POST', headers: { 'X-Test-Role': role, 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const firstDraft = await (await changeRun('versions', {})).json();
    assert.equal(firstDraft.revision, 1);
    assert.equal(firstDraft.snapshot.statements[0].totals.gross, '3000.00');
    const runInput = { engagementId: worker.id, kind: 'overtime', date: '2026-05-12', hours: '10', premium: '50' };
    assert.equal((await changeRun('inputs', runInput)).status, 201);
    assert.equal((await changeRun('versions/' + firstDraft.id + '/approve', { sourceDigest: firstDraft.sourceDigest })).status, 409);
    const updatedDraft = await (await changeRun('versions', {})).json();
    assert.equal(updatedDraft.id, firstDraft.id);
    assert.equal(updatedDraft.snapshot.statements[0].totals.gross, '3225.00');
    const runPath = '/periods/2026-05/versions/' + firstDraft.id;
    const draftDocument = await get(ids.companyA, runPath + '/documents/salary', { role: 'owner' });
    assert.match(await draftDocument.text(), /RASCUNHO/);
    assert.equal((await grant(['read', 'approve'])).status, 200);
    const approvals = await Promise.all(Array.from({ length: 2 }, () =>
      changeRun('versions/' + firstDraft.id + '/approve', { sourceDigest: updatedDraft.sourceDigest }, 'attendant')));
    for (const approval of approvals) {
      assert.equal(approval.status, 200);
      assert.equal((await approval.json()).approvedByUserId, ids.attendant);
    }
    const statements = await admin.query('SELECT count(*)::int AS count FROM payroll_statements WHERE version_id = $1', [firstDraft.id]);
    assert.equal(statements.rows[0].count, 1);
    const statementResponse = await get(ids.companyA, runPath + '/documents/statement?engagementId=' + worker.id, { role: 'owner' });
    const markup = await statementResponse.text();
    assert.equal(statementResponse.status, 200);
    assert.match(markup, /Demonstrativo individual/);
    assert.doesNotMatch(markup, /RASCUNHO/);
    assert.equal((await get(ids.companyB, runPath + '/documents/salary', { role: 'owner' })).status, 404);
    const [payment] = await (await get(ids.companyA, runPath + '/payments', { role: 'owner' })).json();
    assert.equal((await get(ids.companyA, runPath + '/payments/' + payment.id + '/receipt', { role: 'owner' })).status, 404);
    const confirmation = { paidOn: payment.dueOn, paidAmount: payment.amount, evidenceReference: 'TEST-EVIDENCE <record>' };
    function confirm(body) {
      return fetch(`${origin}/companies/${ids.companyA}/payroll${runPath}/payments/${payment.id}`, {
        method: 'PUT', headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    assert.equal((await confirm({ ...confirmation, paidOn: '2026-07-01' })).status, 409);
    assert.equal((await confirm(confirmation)).status, 200);
    assert.equal((await confirm(confirmation)).status, 200);
    const receipt = await get(ids.companyA, runPath + '/payments/' + payment.id + '/receipt', { role: 'owner' });
    assert.match(await receipt.text(), /TEST-EVIDENCE &lt;record&gt;/);
    await assert.rejects(admin.query("UPDATE payroll_versions SET source_digest = 'changed' WHERE id = $1", [firstDraft.id]),
      { code: '23514' });
    assert.equal((await changeRun('versions', {})).status, 422);
    assert.equal((await changeRun('inputs', runInput)).status, 201);
    const correction = await (await changeRun('versions', { correctionReason: 'Revisão de horas' })).json();
    assert.equal(correction.revision, 2);
    assert.equal(correction.snapshot.statements[0].totals.gross, '3450.00');
    assert.equal((await changeRun('versions/' + correction.id + '/approve', { sourceDigest: correction.sourceDigest })).status, 409);
    const historical = await (await get(ids.companyA, '/periods/2026-05/versions/' + firstDraft.id, { role: 'owner' })).json();
    assert.equal(historical.snapshot.statements[0].totals.gross, '3225.00');
    const advancePreview = await (await get(ids.companyA, '/periods/2026-06/preview', { role: 'owner' })).json();
    const advanceStatement = advancePreview.statements.find(row => row.engagementId === worker.id);
    assert.deepEqual(advanceStatement.payments.map(row => [row.kind, row.dueOn.slice(0, 7)]),
      [['advance', '2026-06'], ['balance', '2026-07']]);
    assert.equal(advanceStatement.payments[0].taxable, '1200.00');
    const fortnightPreview = await (await get(ids.companyA, '/periods/2026-09/preview', { role: 'owner' })).json();
    const fortnightStatement = fortnightPreview.statements.find(row => row.engagementId === worker.id);
    assert.deepEqual(fortnightStatement.payments.map(row => [row.kind, row.taxable]),
      [['first_half', '1500.00'], ['second_half', '1500.00']]);

    const { rows: [employer] } = await admin.query(
      "INSERT INTO payroll_employers (tenant_id, office_id, registration_root) VALUES ($1, $2, '04252011') RETURNING id",
      [ids.tenant, ids.officeA],
    );
    await admin.query('INSERT INTO payroll_employer_memberships (tenant_id, office_id, company_id, employer_id) VALUES ($1, $2, $3, $4)', [...scope, employer.id]);
    const { rows: [delivery] } = await admin.query(
      `INSERT INTO payroll_deliveries (tenant_id, office_id, employer_id, environment, competence, mode)
       VALUES ($1, $2, $3, 'production', '2026-05-01', 'external') RETURNING id`, [...scope.slice(0, 2), employer.id],
    );
    await admin.query(
      `INSERT INTO payroll_events (tenant_id, office_id, company_id, employer_id, delivery_id, environment, event_type,
         event_key, origin, status, receipt) VALUES ($1, $2, $3, $4, $5, 'production', 'S-1299', 'closing', 'external', 'accepted', 'TEST-RECEIPT')`,
      [...scope, employer.id, delivery.id],
    );
    function guideRequest(relativePath, body, method = 'POST') {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/guides/2026-05${relativePath}`, {
        method, headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA,
          'Content-Type': Buffer.isBuffer(body) ? 'application/pdf' : 'application/json' },
        body: Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
    }
    assert.equal((await guideRequest('', { kind: 'dctfweb', status: 'declared', officialReference: 'DCTF-TEST' })).status, 201);
    const gfd = await guideRequest('', { kind: 'gfd', status: 'pending' });
    assert.equal(gfd.status, 201);
    const gfdId = (await gfd.json()).id;
    const results = await (await get(ids.companyA, '/guides/2026-05', { role: 'owner' })).json();
    assert.equal(results.delivery.status, 'accepted');
    assert.equal(results.guides.find(guide => guide.kind === 'gfd').status, 'pending');
    const darf = { kind: 'darf', status: 'issued', expectedAmount: '100', amount: '110', officialReference: 'DARF-TEST',
      dueOn: '2026-06-19' };
    assert.equal((await guideRequest('', darf)).status, 422);
    const issued = await guideRequest('', { ...darf, discrepancyReason: 'Ajuste fictício de outro débito.' });
    assert.equal(issued.status, 201);
    const darfId = (await issued.json()).id;
    assert.equal((await guideRequest('/' + darfId, { ...darf, discrepancyReason: 'Ajuste fictício de outro débito.',
      status: 'paid', paidOn: '2026-06-18', paymentReference: 'PAY-TEST' }, 'PUT')).status, 200);
    const attachment = await guideRequest('/' + darfId + '/document', fileBytes, 'PUT');
    assert.equal(attachment.status, 200);
    const guideDocument = '/documents/' + (await attachment.json()).documentId;
    assert.equal((await get(ids.companyB, guideDocument, { role: 'owner' })).status, 404);
    assert.deepEqual(Buffer.from(await (await get(ids.companyA, guideDocument, { role: 'owner' })).arrayBuffer()), fileBytes);
    const afterPayment = await (await get(ids.companyA, '/guides/2026-05', { role: 'owner' })).json();
    assert.equal(afterPayment.guides.find(guide => guide.id === gfdId).status, 'pending');
    assert.equal(afterPayment.guides.find(guide => guide.id === darfId).paidOn, '2026-06-18');
    await admin.query(
      `INSERT INTO payroll_events (tenant_id, office_id, company_id, employer_id, delivery_id, environment, event_type,
        event_key, origin, status, receipt) VALUES ($1,$2,$3,$4,$5,'production','S-1298','reopening','external','accepted','TEST-REOPENING')`,
      [...scope, employer.id, delivery.id],
    );
    const reopening = await (await get(ids.companyA, '/guides/2026-05', { role: 'owner' })).json();
    assert.equal(reopening.delivery.status, 'reopened');
    assert.equal(reopening.guides.find(guide => guide.id === darfId).status, 'paid');

    function esocial(company, path, body, method = 'PUT') {
      return fetch(`${origin}/companies/${company}/payroll/esocial/${path}`, {
        method, headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const settings = { employerReceipt: 'S1000-TEST', authorization: {
      method: 'proxy', reference: 'Evidência fictícia', scopes: ['registration', 'payroll'],
      verifiedOn: '2026-01-01', expiresOn: '2099-01-01',
    }, establishments: [
      { registration: '04252011000110', receipt: 'MAIN-TEST', allocations: [{ code: 'LOT01', receipt: 'ALLOC-1' }] },
      { registration: '04252011000210', receipt: 'BRANCH-TEST', allocations: [{ code: 'LOT02', receipt: 'ALLOC-2' }] },
    ] };
    assert.equal((await esocial(ids.companyA, 'restricted/settings', { ...settings,
      authorization: { ...settings.authorization, expiresOn: '2025-12-31' } })).status, 422);
    for (const company of [ids.companyA, ids.companyB]) {
      const result = await esocial(company, 'restricted/settings', settings);
      assert.equal(result.status, 200);
      const prepared = await result.json();
      assert.equal(prepared.ready, true);
      assert.equal(prepared.settings.employerReceipt, 'S1000-TEST');
      assert.equal(prepared.employerId, employer.id);
    }
    const productionSetup = await (await get(ids.companyA, '/esocial/production/settings', { role: 'owner' })).json();
    assert.equal(productionSetup.ready, false);
    assert.equal(productionSetup.settings.employerReceipt, '');

    const route = 'restricted/deliveries/2026-05';
    assert.equal((await esocial(ids.companyA, route, { mode: 'external', versionId: correction.id })).status, 422);
    const initial = await esocial(ids.companyA, route, { mode: 'external', versionId: firstDraft.id });
    assert.equal(initial.status, 200);
    const initialId = (await initial.json()).id;
    const beneficiaryCpf = '12345678909';
    const officialReceipt = '1.2.0000000000000000001';
    const rubricCodes = Object.fromEntries(['SALARY', 'OVERTIME', 'INSS', 'IRRF'].map(code =>
      [code, { code, table: 'TEST', receipt: officialReceipt }]));
    const preparedRemuneration = await esocial(ids.companyA, route + '/xml', {
      versionId: firstDraft.id, eventType: 'S-1200', beneficiaryCpf, rubrics: rubricCodes,
      locations: { [worker.id]: { harmfulExposure: '1' } },
    }, 'POST');
    assert.equal(preparedRemuneration.status, 200);
    const remuneration = await preparedRemuneration.json();
    assert.match(remuneration.xml, /<perApur>2026-05<\/perApur>/);
    assert.match(remuneration.xml, /<codRubr>OVERTIME<\/codRubr><ideTabRubr>TEST<\/ideTabRubr><vrRubr>225.00<\/vrRubr>/);
    const officialStatementId = /<ideDmDev>([^<]+)<\/ideDmDev>/.exec(remuneration.xml)[1];
    const data = { versionId: firstDraft.id, eventKey: 'EXT-TEST', eventType: 'S-1200', status: 'indeterminate',
      evidence: 'Arquivo externo fictício', protocol: 'TEST-PROTOCOL', beneficiaryCpf };
    const registered = await esocial(ids.companyA, route + '/events', data, 'POST');
    assert.equal(registered.status, 201);
    const eventId = (await registered.json()).id;
    const replay = await esocial(ids.companyA, route + '/events', data, 'POST');
    assert.equal((await replay.json()).id, eventId);
    const otherEstablishment = await (await get(ids.companyB, '/esocial/' + route, { role: 'owner' })).json();
    assert.equal(otherEstablishment.delivery.id, initialId);
    assert.equal(otherEstablishment.delivery.pendingCount, 1);
    assert.deepEqual(otherEstablishment.events, []);
    assert.equal((await esocial(ids.companyA, route, { mode: 'integrated', versionId: firstDraft.id })).status, 409);
    assert.equal((await esocial(ids.companyA, route + '/events/' + eventId + '/reconcile', {
      status: 'accepted', receipt: officialReceipt, evidence: 'Resultado conferido no teste local',
    })).status, 200);
    const transferred = await esocial(ids.companyA, route, { mode: 'integrated', versionId: firstDraft.id });
    assert.equal((await transferred.json()).mode, 'integrated');
    const maintained = await (await get(ids.companyA, '/esocial/' + route, { role: 'owner' })).json();
    assert.equal(maintained.events[0].receipt, officialReceipt);
    const paymentInput = { eventType: 'S-1210', beneficiaryCpf, sources: { [payment.id]: {
      eventId, statementId: officialStatementId,
    } } };
    const cashPeriod = 'deliveries/' + payment.dueOn.slice(0, 7) + '/xml';
    assert.equal((await esocial(ids.companyA, 'production/' + cashPeriod, paymentInput, 'POST')).status, 422);
    const eventPayment = await esocial(ids.companyA, 'restricted/' + cashPeriod, paymentInput, 'POST');
    assert.equal(eventPayment.status, 200);
    const xml = (await eventPayment.json()).xml;
    assert.ok(xml.includes('<perApur>' + payment.dueOn.slice(0, 7) + '</perApur>'));
    assert.ok(xml.includes('<perRef>2026-05</perRef><ideDmDev>' + officialStatementId + '</ideDmDev>'));
    assert.ok(xml.includes('<vrLiq>' + payment.amount + '</vrLiq>'));

    function juneRun(path, body, method = 'POST') {
      return fetch(`${origin}/companies/${ids.companyA}/payroll/periods/2026-06/${path}`, {
        method, headers: { 'X-Test-Role': 'owner', 'X-Office-Id': ids.officeA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const juneVersion = await (await juneRun('versions', {})).json();
    const juneVersionPath = 'versions/' + juneVersion.id;
    assert.equal((await juneRun(juneVersionPath + '/approve', { sourceDigest: juneVersion.sourceDigest })).status, 200);
    const juneRoute = 'restricted/deliveries/2026-06';
    assert.equal((await esocial(ids.companyA, juneRoute, { mode: 'external', versionId: juneVersion.id })).status, 200);
    const advanceRubrics = { ...rubricCodes, ...Object.fromEntries(['SALARY_ADVANCE_CROSS_MONTH', 'SALARY_ADVANCE_OFFSET_CROSS_MONTH']
      .map((code, index) => [code, { code: index ? 'ADV_OFFSET' : 'ADV_PAY', table: 'TEST', receipt: officialReceipt }])) };
    const advanceEvent = await esocial(ids.companyA, juneRoute + '/xml', {
      eventType: 'S-1200', versionId: juneVersion.id, beneficiaryCpf, rubrics: advanceRubrics,
      locations: { [worker.id]: { harmfulExposure: '1' } },
    }, 'POST');
    assert.equal(advanceEvent.status, 200);
    const scheduleXml = (await advanceEvent.json()).xml;
    const advanceIds = [...scheduleXml.matchAll(/<ideDmDev>([^<]+)<\/ideDmDev>/g)].map(match => match[1]);
    assert.equal(new Set(advanceIds).size, 2);
    assert.match(scheduleXml, /<codRubr>ADV_PAY<\/codRubr><ideTabRubr>TEST<\/ideTabRubr><vrRubr>1200.00<\/vrRubr>/);
    assert.match(scheduleXml, /<codRubr>ADV_OFFSET<\/codRubr><ideTabRubr>TEST<\/ideTabRubr><vrRubr>1200.00<\/vrRubr>/);
    const juneSource = await esocial(ids.companyA, juneRoute + '/events', {
      ...data, versionId: juneVersion.id, eventKey: 'EXT-TEST-JUNE', status: 'accepted', receipt: '1.2.0000000000000000003',
    }, 'POST');
    assert.equal(juneSource.status, 201);
    const juneSourceId = (await juneSource.json()).id;
    const junePayments = await (await get(ids.companyA, '/periods/2026-06/' + juneVersionPath + '/payments', { role: 'owner' })).json();
    const early = junePayments.find(row => row.kind === 'advance');
    assert.equal((await juneRun(juneVersionPath + '/payments/' + early.id, {
      paidOn: early.dueOn, paidAmount: early.amount, evidenceReference: 'TEST-ADVANCE',
    }, 'PUT')).status, 200);
    const junePaymentXml = await esocial(ids.companyA, juneRoute + '/xml', {
      ...paymentInput, sources: { ...paymentInput.sources, [early.id]: { eventId: juneSourceId, statementId: advanceIds[0] } },
    }, 'POST');
    assert.equal(junePaymentXml.status, 200);
    const juneXml = (await junePaymentXml.json()).xml;
    assert.match(juneXml, /<perRef>2026-05<\/perRef>/);
    assert.match(juneXml, /<perRef>2026-06<\/perRef>/);
    const previousPaymentEvent = await esocial(ids.companyA, juneRoute + '/events', {
      ...data, versionId: juneVersion.id, eventKey: 'EXT-1210-JUNE', eventType: 'S-1210', status: 'accepted', receipt: '1.2.0000000000000000004',
    }, 'POST');
    assert.equal(previousPaymentEvent.status, 201);
    const retification = await esocial(ids.companyA, juneRoute + '/xml', {
      ...paymentInput, sources: { ...paymentInput.sources, [early.id]: { eventId: juneSourceId, statementId: advanceIds[0] } },
      originalEventId: (await previousPaymentEvent.json()).id,
    }, 'POST');
    assert.equal(retification.status, 200);
    assert.match((await retification.json()).xml, /<indRetif>2<\/indRetif><nrRecibo>1\.2\.0+4<\/nrRecibo>/);

    const schemas = process.env.ESOCIAL_XSD_DIRECTORY;
    if (schemas) {
      const network = require('../dist/domain/payrollEsocialTransport');
      const originalAdapter = network.esocialTransport;
      const keys = {
        ESOCIAL_RESTRICTED_CERTIFICATE_PEM: join(storage, 'test-certificate.pem'),
        ESOCIAL_RESTRICTED_KEY_PEM: join(storage, 'test-key.pem'),
        ESOCIAL_RESTRICTED_TRANSMITTER: '04252011000110',
        ESOCIAL_RESTRICTED_XSD_DIRECTORY: schemas,
      };
      const previousEnvironment = Object.fromEntries([...Object.keys(keys), 'ESOCIAL_RESTRICTED_TRANSMISSION']
        .map(key => [key, process.env[key]]));
      try {
        Object.assign(process.env, keys);
        delete process.env.ESOCIAL_RESTRICTED_TRANSMISSION;
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
          '-keyout', keys.ESOCIAL_RESTRICTED_KEY_PEM, '-out', keys.ESOCIAL_RESTRICTED_CERTIFICATE_PEM,
          '-days', '1', '-subj', '/CN=Local payroll integration fixture'], { stdio: 'ignore' });
        const restrictedOnly = { ...settings, establishments: [settings.establishments[0]] };
        assert.equal((await esocial(ids.companyA, 'restricted/settings', restrictedOnly)).status, 200);
        const admissionQueue = 'restricted/registration' + employeePath + '/queue';
        const admissionQueued = await esocial(ids.companyA, admissionQueue, {}, 'POST');
        assert.equal(admissionQueued.status, 201);
        const admissionEvent = await admissionQueued.json();
        assert.equal(admissionEvent.versionId, null);
        assert.equal(admissionEvent.eventType, 'S-2200');
        const registrationResult = await (await get(ids.companyA, '/esocial/restricted/registration' + employeePath + '/events',
          { role: 'owner' })).json();
        assert.deepEqual(registrationResult.map(event => event.eventKey), [admissionEvent.eventKey]);
        assert.equal((await esocial(ids.companyA, admissionQueue.replace('restricted', 'production'), {}, 'POST')).status, 422);
        const closingInput = { eventType: 'S-1299', versionId: firstDraft.id, included: {
          remuneration: true, payments: false, ruralProduction: false, unionWorkers: false, complementaryInformation: false,
        } };
        const queue = route + '/queue';
        const queuedEvent = await esocial(ids.companyA, queue, closingInput, 'POST');
        assert.equal(queuedEvent.status, 201);
        const closing = await queuedEvent.json();
        assert.equal(closing.status, 'queued');
        const repeated = await (await esocial(ids.companyA, queue, closingInput, 'POST')).json();
        assert.equal(repeated.eventKey, closing.eventKey);
        assert.equal(repeated.id, closing.id);
        const transportRequest = { ids: [closing.id] };
        assert.equal((await esocial(ids.companyA, queue + '/dispatch', transportRequest, 'POST')).status, 503);

        const lotProtocol = '1.2.202605.0000000000000000002';
        let submits = 0;
        let queried = false;
        network.esocialTransport = environment => ({
          submit: async (_root, _transmitter, group, documents) => {
            assert.equal(environment, 'restricted');
            assert.equal(group, 3);
            assert.equal(documents[0].id, closing.eventKey);
            assert.match(documents[0].xml, /<Signature xmlns=/);
            submits++;
            throw new Error('Simulated response loss');
          },
          query: async protocol => {
            assert.equal(protocol, lotProtocol);
            queried = true;
            return { code: 201, description: 'Mock batch result', protocol, occurrences: [], estimatedSeconds: 0,
              events: [{ id: closing.eventKey, code: 201, receipt: officialReceipt, duplicate: false, occurrences: [],
                totalizers: [{ type: 'S-5011', xml: '<mock-totalizer/>' }] }] };
          },
        });
        process.env.ESOCIAL_RESTRICTED_TRANSMISSION = 'enabled';
        const dispatch = await esocial(ids.companyA, queue + '/dispatch', transportRequest, 'POST');
        assert.equal(dispatch.status, 202);
        assert.equal((await esocial(ids.companyA, queue + '/dispatch', transportRequest, 'POST')).status, 409);
        assert.equal(submits, 1);
        const afterTimeout = await (await get(ids.companyA, '/esocial/' + route, { role: 'owner' })).json();
        assert.equal(afterTimeout.events.find(row => row.id === closing.id).status, 'indeterminate');
        await admin.query("UPDATE payroll_events SET outcome = outcome - 'pollAfter' WHERE id = $1", [closing.id]);
        const reconciled = await esocial(ids.companyA, queue + '/poll', {
          ...transportRequest, recoveryProtocol: lotProtocol, evidence: 'Protocolo simulado no teste local',
        }, 'POST');
        assert.equal(reconciled.status, 200);
        assert.equal(queried, true);
        const afterPoll = await (await get(ids.companyA, '/esocial/' + route, { role: 'owner' })).json();
        assert.equal(afterPoll.delivery.pendingCount, 0);
        const accepted = afterPoll.events.find(row => row.id === closing.id);
        assert.equal(accepted.eventKey, closing.eventKey);
        assert.equal(accepted.receipt, officialReceipt);
        assert.equal(accepted.outcome.batch.event.totalizers[0].type, 'S-5011');
        assert.equal((await get(ids.companyA, '/esocial/' + route, { role: 'owner', office: ids.officeB })).status, 404);
      } finally {
        network.esocialTransport = originalAdapter;
        for (const [key, value] of Object.entries(previousEnvironment)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end();
    for (const table of ['payroll_audits', 'payroll_guides', 'payroll_events', 'payroll_deliveries', 'payroll_employer_settings', 'payroll_employer_memberships',
      'payroll_employers', 'payroll_documents', 'payroll_inputs', 'payroll_dependents', 'payroll_payments',
      'payroll_statements', 'payroll_versions', 'payroll_periods', 'payroll_policies', 'payroll_compensation', 'payroll_engagements',
      'payroll_people', 'company_tax_periods', 'companies', 'office_accesses', 'users', 'offices']) {
      await admin.query('DELETE FROM '+table+' WHERE tenant_id = $1', [ids.tenant]).catch(() => {});
    }
    await admin.query('DELETE FROM tenants WHERE id = $1', [ids.tenant]).catch(() => {});
    await admin.end();
    await rm(storage, { recursive: true, force: true });
    delete process.env.PAYROLL_STORAGE_DIRECTORY;
  }
});
