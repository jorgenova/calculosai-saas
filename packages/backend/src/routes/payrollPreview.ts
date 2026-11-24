import { Router } from 'express';
import { createHash } from 'node:crypto';
import { DbClient } from '../config/database';
import { calendarDay, calendarMonth, createPayrollCalendar, PolicyRules } from '../domain/payrollCalendar';
import { CalculationInput, calculatePayrollByPerson, serializedPayroll } from '../domain/payrollCalculation';
import { formatPayrollTotal, payrollDate, payrollDocument, payrollMoney } from '../domain/payrollDocuments';
import { asPayrollRecord, Details, isCivilDate, payrollText } from '../domain/payrollPeople';
import { Benefit, earningsAndEvents, TimeEntry, totalsFor } from '../domain/payrollRubrics';
import { maxAmount, minAmount, Money, publishedTaxRules, roundRatio, toCents } from '../domain/payrollTaxes';
import { vacationSettlement } from '../domain/payrollVacation';
import { PayrollContext, PayrollError, payrollAction, sendPayrollDocument } from '../middlewares/payroll';
import { readConditions } from './payrollConditions';
import { lockPayrollCompany, readPolicies } from './payrollPolicies';
import { readVacations } from './payrollVacation';

type Link = {
  id: string; personId: string; fullName: string; kind: 'employee' | 'partner'; categoryCode: number;
  startsOn: string; endsOn: string | null; details: Details; establishment: string | null; allocation: string | null;
  cpf: string; birthDate: string | null; registration: string | null;
};
type Pay = { id: string; amount: string; unit: string; startsOn: string; endsOn: string | null };
type Input = { id: string; kind: string; startsOn: string; value: Record<string, string> };
type CalculationRules = NonNullable<PolicyRules['calculation']>;
type VacationPeriod = { startsOn: string; endsOn: string };

function scope(context: PayrollContext) { return [context.company.id, context.user.tenantId, context.officeId]; }

function startOfMonth(month: string) {
  const start = month + '-01';
  if (!isCivilDate(start)) throw new PayrollError(422, 'Informe a competência no formato AAAA-MM.');
  return start;
}

function segmentDays(start: string, end: string) {
  return BigInt((Date.parse(end) - Date.parse(start)) / 86400000 + 1);
}

function decimal(value: string | undefined) {
  return /^\d{1,12}(\.\d{1,2})?$/.test(value ?? '') ? toCents(value!) : null;
}

function monthlyPay(periods: Pay[], from: string, to: string, month: string, calculation: CalculationRules,
  vacations: VacationPeriod[]) {
  const days = segmentDays(month, calendarDay(calendarMonth(month, 1), -1));
  let uncovered = segmentDays(from, to);
  let amount = 0n;
  for (const period of periods) {
    const start = period.startsOn > from ? period.startsOn : from;
    const end = period.endsOn && period.endsOn < to ? period.endsOn : to;
    if (start > end) continue;
    if (period.unit !== 'month') return null;
    const count = segmentDays(start, end);
    const divisor = calculation.monthlyProration === 'thirty_days' ? 30n : days;
    let payable = count;
    for (const vacation of vacations) {
      const leaveStart = vacation.startsOn > start ? vacation.startsOn : start;
      const leaveEnd = vacation.endsOn < end ? vacation.endsOn : end;
      if (leaveStart <= leaveEnd) payable -= segmentDays(leaveStart, leaveEnd);
    }
    amount += payable === days ? toCents(period.amount)
      : roundRatio(toCents(period.amount), minAmount(payable, divisor), divisor);
    uncovered -= count;
  }
  return uncovered === 0n ? amount : null;
}

function regularPay(periods: Pay[], events: Input[], from: string, to: string, month: string, calculation: CalculationRules,
  vacations: VacationPeriod[]) {
  if (periods.every(period => period.unit === 'month')) return monthlyPay(periods, from, to, month, calculation, vacations);
  if (vacations.length) return null;
  if (periods.some(period => period.unit !== 'hour')) return null;
  const entries = events.filter(event => event.kind === 'regular_hours');
  if (!entries.length) return null;
  let gross = 0n;
  for (const entry of entries) {
    const period = periods.find(period => period.startsOn <= entry.startsOn && (!period.endsOn || period.endsOn >= entry.startsOn));
    const hours = decimal(entry.value.hours);
    if (!period || !hours) return null;
    gross += roundRatio(toCents(period.amount), hours, 100n);
  }
  return gross;
}

function makeTimeEntries(events: Input[], periods: Pay[], link: Link) {
  const entries: TimeEntry[] = [];
  for (const event of events) {
    if (event.kind === 'regular_hours') continue;
    const quantity = decimal(event.value.hours);
    if (quantity === null || quantity <= 0n) return null;
    if (event.kind === 'paid_leave') {
      entries.push({ id: event.id, kind: 'paid', quantityHundredths: quantity, hourlyBase: 0n });
      continue;
    }
    const period = periods.find(row => row.startsOn <= event.startsOn && (!row.endsOn || row.endsOn >= event.startsOn));
    const divisor = decimal(link.details.monthlyHoursDivisor);
    if (!period || (period.unit !== 'hour' && (period.unit !== 'month' || !divisor))) return null;
    const premium = event.kind === 'overtime' ? decimal(event.value.premium) : null;
    entries.push({ id: event.id, kind: event.kind === 'overtime' ? 'overtime' : 'unpaid', quantityHundredths: quantity,
      hourlyBase: period.unit === 'hour' ? toCents(period.amount) : roundRatio(toCents(period.amount), 100n, divisor!),
      premiumBasisPoints: premium ?? undefined });
  }
  return entries;
}

async function loadPreview(client: DbClient, context: PayrollContext, month: string, lockTaxPeriod = false) {
  const from = startOfMonth(month);
  const to = calendarDay(calendarMonth(from, 1), -1);
  const [policy] = await readPolicies(client, context, from);
  if (!policy) throw new PayrollError(422, 'Configure a política de pagamento da competência.');
  const calculation = policy.rules.calculation;
  if (!calculation) throw new PayrollError(422, 'Informe os parâmetros de cálculo validados pelo escritório na política da competência.');
  const { rows: [taxPeriod] } = await client.query<{ tax_regime: string }>(
    `SELECT tax_regime::text FROM company_tax_periods WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND start_date <= $4 AND (end_date IS NULL OR end_date >= $4)` + (lockTaxPeriod ? ' FOR SHARE' : ''),
    [...scope(context), from],
  );
  if (!taxPeriod) throw new PayrollError(422, 'A empresa ainda não tem regime tributário vigente na competência.');
  const { rows: links } = await client.query<Link>(
    `SELECT e.id, e.person_id AS "personId", e.kind, e.category_code AS "categoryCode", p.full_name AS "fullName",
       e.starts_on::text AS "startsOn", e.ends_on::text AS "endsOn", e.details, e.establishment_registration AS establishment,
       e.tax_allocation_code AS allocation, e.registration, p.cpf, p.birth_date::text AS "birthDate"
     FROM payroll_engagements e JOIN payroll_people p ON p.id = e.person_id AND p.company_id = e.company_id
       AND p.tenant_id = e.tenant_id AND p.office_id = e.office_id
     WHERE e.company_id = $1 AND e.tenant_id = $2 AND e.office_id = $3 AND e.status IN ('active','ended')
       AND e.starts_on <= $5 AND (e.ends_on IS NULL OR e.ends_on >= $4)
     ORDER BY p.full_name, e.id`,
    [...scope(context), from, to],
  );
  const pending: { id: string; personId: string; fullName: string; input: CalculationInput; declaration: {
    cpf: string; birthDate: string | null; registration: string | null; category: number;
    establishment: string | null; allocation: string | null; registeredPartner: boolean;
  } }[] = [];
  const incomplete = new Set<string>();
  const issues: string[] = [];
  const vacations = await readVacations(client, context, { start: from, end: to });
  for (const vacation of vacations.filter(row => !row.value.payment)) {
    incomplete.add(vacation.personId);
    issues.push(`${vacation.fullName}: confirme o pagamento de férias para apurar o saldo mensal.`);
  }
  for (const link of links) {
    if (incomplete.has(link.personId)) continue;
    const start = link.startsOn > from ? link.startsOn : from;
    const end = link.endsOn && link.endsOn < to ? link.endsOn : to;
    const { rows: periods } = await client.query<Pay>(
      `SELECT id, amount::text, unit, starts_on::text AS "startsOn", ends_on::text AS "endsOn" FROM payroll_compensation
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4
          AND starts_on <= $6 AND (ends_on IS NULL OR ends_on >= $5) ORDER BY starts_on`,
      [...scope(context), link.id, start, end],
    );
    const { rows: events } = await client.query<Input>(
      `SELECT id, kind, starts_on::text AS "startsOn", value FROM payroll_inputs
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4
          AND kind IN ('regular_hours','overtime','unpaid_absence','paid_leave') AND starts_on BETWEEN $5 AND $6 ORDER BY starts_on, id`,
      [...scope(context), link.id, start, end],
    );
    const leave = vacations.filter(row => row.engagementId === link.id);
    const settlements = leave.flatMap(row => {
      const settlement = row.value.payment && vacationSettlement(row.value.allocations, row.value.payment, month);
      return settlement ? [{ ...settlement, id: row.id }] : [];
    });
    if (settlements.length !== leave.length
      || events.some(event => leave.some(row => event.startsOn >= row.startsOn && event.startsOn <= row.endsOn))) {
      incomplete.add(link.personId);
      issues.push(`${link.fullName}: confira as férias e os lançamentos que coincidem com o período de gozo.`);
      continue;
    }
    const basePay = regularPay(periods, events, start, end, from, calculation, leave);
    const timeEntries = makeTimeEntries(events, periods, link);
    if (basePay === null || !timeEntries) {
      incomplete.add(link.personId);
      issues.push(`${link.fullName}: revise vigências, a unidade salarial, horas regulares e o divisor de horas.`);
      continue;
    }
    const calendar = createPayrollCalendar(from, policy.mode, policy.rules, link.establishment ?? '');
    const regularKind = link.kind === 'partner' ? 'partner' : policy.mode === 'semimonthly' ? 'second_half' : 'salary';
    const firstHalf = link.kind === 'employee' && policy.mode === 'semimonthly'
      ? calendar.dates.find(item => item.kind === 'first_half') : undefined;
    const payment = firstHalf && end <= firstHalf.endsOn ? firstHalf : calendar.dates.find(item => item.kind === regularKind);
    if (!payment?.dueOn) {
      incomplete.add(link.personId);
      issues.push(`${link.fullName}: confira a modalidade e as datas de pagamento.`);
      continue;
    }
    for (const problem of Object.values(calendar.issues)) issues.push(`${link.fullName}: ${problem}`);
    let earlyPayment: CalculationInput['earlyPayment'];
    const advance = link.kind === 'employee' && policy.mode === 'monthly_advance'
      ? calendar.dates.find(item => item.kind === 'advance') : undefined;
    if (advance?.dueOn) {
      const amount = toCents(policy.rules.advance.amount);
      earlyPayment = { kind: 'advance', dueOn: advance.dueOn,
        gross: policy.rules.advance.unit === 'percentage' ? roundRatio(basePay, amount, 10000n) : amount };
    }
    if (firstHalf?.dueOn && payment !== firstHalf && start <= firstHalf.endsOn) {
      const cutoff = firstHalf.endsOn;
      const firstEvents = events.filter(event => event.startsOn <= cutoff);
      const firstBase = regularPay(periods, firstEvents, start, cutoff, from, calculation, leave);
      const firstTime = makeTimeEntries(firstEvents, periods, link);
      if (firstBase === null || !firstTime) {
        incomplete.add(link.personId);
        issues.push(`${link.fullName}: confira as vigências e os lançamentos da primeira quinzena.`);
        continue;
      }
      const firstGross = totalsFor(earningsAndEvents({ kind: 'employee', basePay: firstBase,
        baseSource: 'first_half', timeEntries: firstTime, benefits: [] })).bases.irrf;
      earlyPayment = { kind: 'first_half', dueOn: firstHalf.dueOn, gross: firstGross };
    }
    const conditions = await readConditions(client, context, link, month);
    const benefits: Benefit[] = [];
    let previousEmployeeBase: Money = 0n;
    let previousIndividualBase: Money = 0n;
    const externalRegistrations = new Set<string>();
    for (const entry of conditions.records as { id: string; kind: string; value: Record<string, string> }[]) {
      const values = entry.value;
      if (entry.kind === 'other_source') {
        if (externalRegistrations.has(values.registration)) {
          issues.push(`${link.fullName}: há duas vigências da mesma fonte previdenciária nesta competência. Confira o valor declarado.`);
          continue;
        }
        externalRegistrations.add(values.registration);
        const source = decimal(values.remuneration) ?? 0n;
        if (Number(values.categoryCode) < 700) previousEmployeeBase += source;
        else previousIndividualBase += source;
        continue;
      }
      const common = { id: entry.id, amount: decimal(values.amount) ?? 0n, discount: decimal(values.discount) ?? 0n,
        rule: values.discountRule as Benefit['rule'] };
      if (entry.kind === 'transport_voucher') benefits.push({ ...common, kind: 'transport' });
      else {
        const mealType = values.mealType as Extract<Benefit, { kind: 'meal' }>['mealType'];
        if (!['cash', 'card_pat', 'card_other', 'meal_pat', 'meal_other'].includes(mealType)) {
          issues.push(`${link.fullName}: classifique o vale-refeição para o eSocial.`);
        } else benefits.push({ ...common, kind: 'meal', mealType });
      }
    }
    const { rows: [{ count: dependents }] } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM payroll_dependents
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND person_id = $4
          AND income_tax AND starts_on <= $5::date AND (ends_on IS NULL OR ends_on >= $5::date)`,
      [...scope(context), link.personId, payment.dueOn],
    );
    const { rows: history } = await client.query<{ paidOn: string; taxable: string | null; deductions: string | null; withheld: string | null }>(
      `SELECT pay.paid_on::text AS "paidOn", pay.taxable_amount::text AS taxable, pay.legal_deductions::text AS deductions,
        pay.withheld_income_tax::text AS withheld
       FROM payroll_payments pay JOIN payroll_statements s ON s.id = pay.statement_id
        JOIN payroll_engagements e ON e.id = s.engagement_id
        JOIN payroll_versions v ON v.id = s.version_id JOIN payroll_periods p ON p.id = v.period_id
       WHERE pay.company_id = $1 AND pay.tenant_id = $2 AND pay.office_id = $3 AND e.person_id = $4
         AND p.competence <> $5 AND pay.paid_on >= $5 AND pay.paid_on < $6 ORDER BY pay.paid_on, pay.id`,
      [...scope(context), link.personId, from, calendarMonth(payment.dueOn.slice(0, 7) + '-01', 1)],
    );
    if (history.some(row => row.taxable === null || row.deductions === null || row.withheld === null)) {
      incomplete.add(link.personId);
      issues.push(`${link.fullName}: confira as bases de IRRF dos pagamentos anteriores no mesmo mês.`);
      continue;
    }
    pending.push({ id: link.id, personId: link.personId, fullName: link.fullName, declaration: {
      cpf: link.cpf, birthDate: link.birthDate, registration: link.registration, category: link.categoryCode,
      establishment: link.establishment, allocation: link.allocation, registeredPartner: link.details.registerWithEsocial === 'yes',
    }, input: {
      kind: link.kind, competence: from, paidOn: payment.dueOn, basePay, baseSource: periods.map(period => period.id).join(','),
      timeEntries, benefits, earlyPayment, vacations: settlements, previousPayments: history.map(row => ({ paidOn: row.paidOn, taxable: toCents(row.taxable!),
        legalDeductions: toCents(row.deductions!), withheld: toCents(row.withheld!) })), fiscal: {
        employerBasisPoints: toCents(link.kind === 'employee' ? calculation.employeeEmployerRate : calculation.partnerEmployerRate),
        partnerWithholdingBasisPoints: toCents(calculation.partnerWithholdingRate), fgtsBasisPoints: link.categoryCode === 103 ? 200n : 800n,
        previousEmployeeBase, previousIndividualBase, dependents, legalDeductions: 0n, previousPaidLegalDeductions: 0n,
        previousIncome: 0n, previousIncomeTax: 0n, source: calculation.reference,
      },
    } });
  }
  const statements = calculatePayrollByPerson(pending.filter(entry => !incomplete.has(entry.personId)))
    .map(({ entry, result }) => ({
      engagementId: entry.id, personId: entry.personId, fullName: entry.fullName, kind: entry.input.kind,
      dueOn: entry.input.paidOn, ...serializedPayroll(result),
    }));
  const preview = {
    competence: month, companyName: context.company.name, policyId: policy.id,
    taxRegime: taxPeriod.tax_regime, statements, issues: [...new Set(issues)],
    vacations: vacations.flatMap(vacation => vacation.value.allocations
      .filter(allocation => allocation.competence === month)
      .map(allocation => ({ id: vacation.id, fullName: vacation.fullName, ...allocation }))),
  };
  const effectiveRules = [...new Set(pending.flatMap(entry => [entry.input.paidOn, entry.input.earlyPayment?.dueOn ?? entry.input.paidOn]))].sort()
    .map(paidOn => ({ paidOn, ...publishedTaxRules(from, paidOn) }));
  const sources = JSON.stringify({ engineVersion: 3, policy, effectiveRules, entries: pending },
    (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  return { preview, sources };
}

const router = Router({ mergeParams: true });

router.get('/:month/preview', payrollAction('read', async (client, context, request) => (
  await loadPreview(client, context, request.params.month)
).preview));

type Preview = Awaited<ReturnType<typeof loadPreview>>['preview'];
type Version = {
  id: string; revision: number; sourceDigest: string; correctionReason: string | null;
  approvedAt: Date | null; approvedByUserId: string | null; createdAt: Date; snapshot: Preview | null;
};

const versionColumns = `v.id, v.revision, v.source_digest AS "sourceDigest", v.correction_reason AS "correctionReason",
  v.approved_at AS "approvedAt", v.approved_by_user_id AS "approvedByUserId", v.created_at AS "createdAt",
  v.inputs->'preview' AS snapshot`;

async function findVersions(client: DbClient, context: PayrollContext, month: string, versionId?: string) {
  const { rows } = await client.query<Version>(
    `SELECT ${versionColumns} FROM payroll_versions v JOIN payroll_periods p ON p.id = v.period_id
      WHERE v.company_id = $1 AND v.tenant_id = $2 AND v.office_id = $3 AND p.competence = $4
        AND ($5::text IS NULL OR v.id = $5)
      ORDER BY v.revision DESC`, [...scope(context), startOfMonth(month), versionId ?? null],
  );
  return rows;
}

function digest(sources: string, preview: Preview) {
  return createHash('sha256').update(sources).update(JSON.stringify(preview)).digest('hex');
}

router.get('/:month/versions', payrollAction('read', async (client, context, request) => (
  await findVersions(client, context, request.params.month)
).map(({ snapshot: _snapshot, ...version }) => version)));

router.get('/:month/versions/:versionId', payrollAction('read', async (client, context, request) => {
  const [version] = await findVersions(client, context, request.params.month, request.params.versionId);
  if (!version) throw new PayrollError(404, 'Versão da folha não encontrada.');
  return version;
}));

router.post('/:month/versions', payrollAction('write', async (client, context, request) => {
  const { month } = request.params;
  const competence = startOfMonth(month);
  await lockPayrollCompany(client, context);
  const [latest] = await findVersions(client, context, month);
  const reason = payrollText(asPayrollRecord(request.body).correctionReason) || latest?.correctionReason || null;
  if (latest?.approvedAt && !payrollText(asPayrollRecord(request.body).correctionReason)) {
    throw new PayrollError(422, 'Informe o motivo da nova versão depois da aprovação.');
  }
  if (reason && reason.length > 1000) throw new PayrollError(422, 'O motivo deve ter até 1.000 caracteres.');
  const { preview, sources } = await loadPreview(client, context, month, true);
  const sourceDigest = digest(sources, preview);
  const inputs = { sources: JSON.parse(sources), preview };
  const totals = { statements: preview.statements.length, issues: preview.issues.length };
  const keys = scope(context);
  if (latest && !latest.approvedAt) {
    await client.query(
      `UPDATE payroll_versions SET policy_id = $5, source_digest = $6, inputs = $7, totals = $8, correction_reason = $9
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4`,
      [...keys, latest.id, preview.policyId, sourceDigest, inputs, totals, reason],
    );
    return (await findVersions(client, context, month, latest.id))[0];
  }
  await client.query('INSERT INTO payroll_periods (company_id, tenant_id, office_id, competence) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id, competence) DO NOTHING',
    [...keys, competence]);
  const { rows: [{ id }] } = await client.query<{ id: string }>(
    `INSERT INTO payroll_versions (company_id, tenant_id, office_id, period_id, policy_id, revision,
      source_digest, inputs, totals, correction_reason)
     VALUES ($1, $2, $3, (SELECT p.id FROM payroll_periods p WHERE p.company_id = $1 AND p.tenant_id = $2
       AND p.office_id = $3 AND p.competence = $4), $5, $6, $7, $8, $9, $10) RETURNING id`,
    [...keys, competence, preview.policyId, (latest?.revision ?? 0) + 1, sourceDigest, inputs, totals, latest ? reason : null],
  );
  return (await findVersions(client, context, month, id))[0];
}));

router.post('/:month/versions/:versionId/approve', payrollAction('approve', async (client, context, request) => {
  const { month, versionId } = request.params;
  await lockPayrollCompany(client, context);
  const [version] = await findVersions(client, context, month, versionId);
  if (!version?.snapshot) throw new PayrollError(404, 'Versão da folha não encontrada.');
  if (version.approvedAt) return version;
  if (asPayrollRecord(request.body).sourceDigest !== version.sourceDigest) {
    throw new PayrollError(409, 'A versão foi recalculada. Abra a versão atual para revisar.');
  }
  const { preview, sources } = await loadPreview(client, context, month, true);
  if (version.sourceDigest !== digest(sources, preview)) {
    throw new PayrollError(409, 'Os dados da folha mudaram. Recalcule e revise antes de aprovar.');
  }
  if (!preview.statements.length || preview.issues.length || preview.statements.some(statement => statement.issues.length)) {
    throw new PayrollError(422, 'Resolva as pendências da apuração antes de aprovar.');
  }
  const keys = scope(context);
  if (version.revision > 1) {
    const paidEarlier = await client.query(
      `SELECT 1 FROM payroll_versions target_version
       JOIN payroll_versions earlier ON earlier.period_id = target_version.period_id AND earlier.revision < target_version.revision
       JOIN payroll_statements s ON s.version_id = earlier.id JOIN payroll_payments payment ON payment.statement_id = s.id
       WHERE target_version.company_id = $1 AND target_version.tenant_id = $2 AND target_version.office_id = $3
         AND target_version.id = $4 AND payment.paid_on IS NOT NULL LIMIT 1`, [...keys, versionId],
    );
    if (paidEarlier.rowCount) throw new PayrollError(409, 'Concilie os pagamentos já realizados antes de aprovar a versão de correção.');
  }
  for (const [index, statement] of preview.statements.entries()) {
    const { rows: [{ id }] } = await client.query<{ id: string }>(
      `INSERT INTO payroll_statements (company_id, tenant_id, office_id, version_id, engagement_id, reference, kind,
         gross, deductions, net, employer_charges, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) RETURNING id`,
      [...keys, versionId, statement.engagementId, String(index + 1), statement.kind, statement.totals.gross,
        statement.totals.deductions, statement.totals.net, statement.totals.employerCharges, JSON.stringify(statement.items)],
    );
    for (const payment of statement.payments.filter(row => toCents(row.amount) > 0n)) {
      await client.query(
        `INSERT INTO payroll_payments (company_id, tenant_id, office_id, statement_id, due_on, amount,
          kind, taxable_amount, legal_deductions, withheld_income_tax)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [...keys, id, payment.dueOn, payment.amount, payment.kind, payment.taxable, payment.legalDeductions, payment.withheld],
      );
    }
  }
  await client.query(
    'UPDATE payroll_versions SET approved_at = now(), approved_by_user_id = $5 WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4',
    [...keys, versionId, context.user.userId],
  );
  await client.query(
    `INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id)
     VALUES ($1, $2, $3, $4, 'approve_payroll_version', $5)`, [...keys, context.user.userId, versionId],
  );
  return (await findVersions(client, context, month, versionId))[0];
}));

type Payment = {
  id: string; reference: string; engagementId: string; amount: string; dueOn: string; kind: string;
  paidAmount: string | null; paidOn: string | null; evidenceReference: string | null;
};
async function findPayments(client: DbClient, context: PayrollContext, month: string, versionId: string, paymentId?: string) {
  const { rows } = await client.query<Payment>(
    `SELECT pay.id, s.reference, s.engagement_id AS "engagementId", pay.amount::text, pay.due_on::text AS "dueOn", pay.kind,
      pay.paid_amount::text AS "paidAmount", pay.paid_on::text AS "paidOn", pay.evidence_reference AS "evidenceReference"
     FROM payroll_payments pay JOIN payroll_statements s ON s.id = pay.statement_id
     JOIN payroll_versions v ON v.id = s.version_id JOIN payroll_periods p ON p.id = v.period_id
     WHERE pay.company_id = $1 AND pay.tenant_id = $2 AND pay.office_id = $3 AND p.competence = $4
       AND v.id = $5 AND v.approved_at IS NOT NULL AND ($6::text IS NULL OR pay.id = $6)
     ORDER BY pay.due_on, s.reference, pay.id`, [...scope(context), startOfMonth(month), versionId, paymentId ?? null],
  );
  return rows;
}

router.get('/:month/versions/:versionId/payments', payrollAction('read', (client, context, request) =>
  findPayments(client, context, request.params.month, request.params.versionId)));

router.put('/:month/versions/:versionId/payments/:paymentId', payrollAction('write', async (client, context, request) => {
  const { month, versionId, paymentId } = request.params;
  const input = asPayrollRecord(request.body);
  const paidAmount = payrollText(input.paidAmount).replace(',', '.');
  const paidOn = payrollText(input.paidOn);
  const evidenceReference = payrollText(input.evidenceReference);
  if (decimal(paidAmount) === null || !isCivilDate(paidOn) || !evidenceReference || evidenceReference.length > 250) {
    throw new PayrollError(422, 'Informe o valor, a data e a referência do pagamento.');
  }
  await lockPayrollCompany(client, context);
  const [payment] = await findPayments(client, context, month, versionId, paymentId);
  if (!payment) throw new PayrollError(404, 'Pagamento não encontrado.');
  if (payment.paidOn) {
    if (payment.paidOn === paidOn && decimal(payment.paidAmount ?? '') === decimal(paidAmount)
      && payment.evidenceReference === evidenceReference) return payment;
    throw new PayrollError(409, 'O pagamento já tem confirmação registrada.');
  }
  const [latest] = await findVersions(client, context, month);
  if (latest?.id !== versionId) throw new PayrollError(409, 'Selecione a última versão da folha antes de registrar o pagamento.');
  if (paidOn.slice(0, 7) !== payment.dueOn.slice(0, 7) || decimal(payment.amount) !== decimal(paidAmount)) {
    throw new PayrollError(409, 'O pagamento diverge do valor ou do mês apurado. Revise a folha antes de confirmar.');
  }
  if (paidOn !== payment.dueOn) {
    const { rows: [collision] } = await client.query(
      `SELECT 1 FROM payroll_statements s JOIN payroll_engagements e ON e.id = s.engagement_id
       JOIN payroll_engagements target ON target.id = $5 JOIN payroll_payments pay ON pay.statement_id = s.id
       WHERE pay.company_id = $1 AND pay.tenant_id = $2 AND pay.office_id = $3 AND pay.id <> $4
         AND e.person_id = target.person_id AND date_trunc('month', coalesce(pay.paid_on, pay.due_on)::timestamp) =
            date_trunc('month', $6::date::timestamp) LIMIT 1`,
      [...scope(context), paymentId, payment.engagementId, paidOn],
    );
    if (collision) throw new PayrollError(409, 'A mudança de data exige rever a sequência de retenções deste CPF.');
  }
  const keys = scope(context);
  await client.query(
    `UPDATE payroll_payments SET paid_on = $5, paid_amount = $6, evidence_reference = $7
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4 AND paid_on IS NULL`,
    [...keys, paymentId, paidOn, paidAmount, evidenceReference],
  );
  await client.query(
    `INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id)
     VALUES ($1, $2, $3, $4, 'record_payroll_payment', $5)`, [...keys, context.user.userId, paymentId],
  );
  return (await findPayments(client, context, month, versionId, paymentId))[0];
}));

router.get('/:month/versions/:versionId/documents/:kind', payrollAction('read', async (client, context, request) => {
  const { month, versionId, kind } = request.params;
  const [version] = await findVersions(client, context, month, versionId);
  if (!version?.snapshot || !['salary', 'partner', 'statement'].includes(kind)) throw new PayrollError(404, 'Documento não encontrado.');
  const statements = version.snapshot.statements.filter(row => kind === 'statement' ? row.engagementId === request.query.engagementId
    : row.kind === (kind === 'salary' ? 'employee' : 'partner'));
  if (!statements.length) throw new PayrollError(404, 'Não há demonstrativos para este documento.');
  const title = kind === 'salary' ? 'Folha de salários' : kind === 'partner' ? 'Folha de pró-labore' : 'Demonstrativo individual';
  const sections = [{ rows: [['Competência', payrollDate(month)], ['Versão', String(version.revision)],
    ['Total bruto', formatPayrollTotal(statements.map(row => row.totals.gross))],
    ['Total de descontos', formatPayrollTotal(statements.map(row => row.totals.deductions))],
    ['Total líquido', formatPayrollTotal(statements.map(row => row.totals.net))],
    ['Encargos do empregador', formatPayrollTotal(statements.map(row => row.totals.employerCharges))]] as [string, string][] }];
  const details = statements.map(row => ({ title: row.fullName, rows: [
    ['Vencimento', payrollDate(row.dueOn)], ...row.items.map(item => [item.label, payrollMoney(item.amount)]),
    ['Bruto', payrollMoney(row.totals.gross)], ['Descontos', payrollMoney(row.totals.deductions)], ['Líquido', payrollMoney(row.totals.net)],
  ] as [string, string][] }));
  return { filename: `${kind}-${month}-v${version.revision}.html`,
    html: payrollDocument(title, version.snapshot.companyName ?? context.company.name, [...sections, ...details], !version.approvedAt) };
}, sendPayrollDocument));

router.get('/:month/versions/:versionId/payments/:paymentId/receipt', payrollAction('read', async (client, context, request) => {
  const { month, versionId, paymentId } = request.params;
  const [version] = await findVersions(client, context, month, versionId);
  const [payment] = await findPayments(client, context, month, versionId, paymentId);
  if (!version?.snapshot || !payment?.paidOn || !payment.paidAmount || !payment.evidenceReference) {
    throw new PayrollError(404, 'Recibo de pagamento não encontrado.');
  }
  const statement = version.snapshot.statements.find(row => row.engagementId === payment.engagementId);
  if (!statement) throw new PayrollError(404, 'Demonstrativo de origem não encontrado.');
  return { filename: `recibo-${month}-v${version.revision}-${payment.reference}-${payment.kind}.html`,
    html: payrollDocument('Recibo de pagamento', version.snapshot.companyName ?? context.company.name, [{ rows: [
      ['Beneficiário', statement.fullName], ['Competência', payrollDate(month)], ['Versão', String(version.revision)],
      ['Demonstrativo', payment.reference], ['Modalidade', ({ regular: 'Pagamento regular', advance: 'Adiantamento',
        balance: 'Saldo', first_half: 'Primeira quinzena', second_half: 'Segunda quinzena' } as Record<string, string>)[payment.kind]],
      ['Data do pagamento', payrollDate(payment.paidOn)],
      ['Valor recebido', payrollMoney(payment.paidAmount)], ['Referência do pagamento', payment.evidenceReference],
    ] }]) };
}, sendPayrollDocument));

router.post('/:month/inputs', payrollAction('write', async (client, context, request) => {
  const month = startOfMonth(request.params.month);
  const body = asPayrollRecord(request.body);
  const date = payrollText(body.date);
  const kind = payrollText(body.kind);
  const hours = payrollText(body.hours).replace(',', '.');
  const premium = payrollText(body.premium).replace(',', '.');
  const engagementId = payrollText(body.engagementId);
  if (!isCivilDate(date) || !date.startsWith(month.slice(0, 7)) || !['regular_hours', 'overtime', 'unpaid_absence', 'paid_leave'].includes(kind)
      || !decimal(hours) || (kind === 'overtime' && (decimal(premium) ?? 0n) < 5000n)) {
    throw new PayrollError(422, 'Informe o vínculo, a data, as horas e o adicional aplicável.');
  }
  await lockPayrollCompany(client, context);
  const keys = scope(context);
  const { rows: [link] } = await client.query(
    `SELECT id FROM payroll_engagements WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4
       AND kind = 'employee' AND status <> 'draft' AND starts_on <= $5 AND (ends_on IS NULL OR ends_on >= $5)`,
    [...keys, engagementId, date],
  );
  if (!link) throw new PayrollError(404, 'Vínculo elegível não encontrado.');
  await client.query('INSERT INTO payroll_periods (company_id, tenant_id, office_id, competence) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id, competence) DO NOTHING',
    [...keys, month]);
  const { rows: [input] } = await client.query(
    `INSERT INTO payroll_inputs (company_id, tenant_id, office_id, engagement_id, period_id, kind, starts_on, value)
     VALUES ($1, $2, $3, $4, (SELECT id FROM payroll_periods WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND competence = $5), $6, $7, $8)
     RETURNING id`,
    [...keys, engagementId, month, kind, date, { hours, ...(kind === 'overtime' ? { premium } : {}) }],
  );
  return input;
}, (response, result) => { response.status(201).json(result); }));

export default router;
