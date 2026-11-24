import { Router } from 'express';
import { createHash, randomInt } from 'node:crypto';
import { DbClient } from '../config/database';
import { esocialConfiguration, esocialTransmissionEnabled, validateEsocialDocument } from '../config/payrollEsocialConfig';
import { admissionIssues, asPayrollRecord, isCivilDate, payrollText, readEngagement } from '../domain/payrollPeople';
import { employeeAdmission, EsocialDependent, EsocialDocument, EsocialHeader, esocialEventId, partnerRegistration, payrollClosing,
  payrollPayments, payrollRemuneration, payrollReopening, signEsocialDocument, temporaryLeave } from '../domain/payrollEsocialXml';
import { BatchOutcome, esocialProtocol, esocialTransport, outcomeForQueuedEvent } from '../domain/payrollEsocialTransport';
import { isValidCpf } from '../domain/taxIdentification';
import { centsText, toCents } from '../domain/payrollTaxes';
import { PayrollContext, PayrollError, payrollAction, withPayrollContext } from '../middlewares/payroll';
import { getEngagement } from './payrollPeople';
import { readVacations } from './payrollVacation';

type Environment = 'restricted' | 'production';
type Authorization = { method: string; reference: string; verifiedOn: string; expiresOn: string; scopes: string[] };
type Establishment = { registration: string; receipt: string; allocations: { code: string; receipt: string }[] };
type Settings = { employerReceipt: string; authorization: Authorization | null; establishments: Establishment[] };
type Delivery = { id: string; mode: 'external' | 'integrated'; pendingCount: number };
type Event = { id: string; eventKey: string; eventType: string; versionId: string | null; origin: string; status: string;
  protocol: string | null; receipt: string | null; outcome: {
    evidence?: string; reconciliation?: string; beneficiaryCpf?: string;
  } | null };
type ApprovedSource = {
  id: string; fullName: string;
  declaration?: { cpf: string; birthDate: string | null; registration: string | null; category: number;
    establishment: string | null; allocation: string | null; registeredPartner: boolean };
  input: { vacations?: unknown[]; fiscal: { previousEmployeeBase: string; previousIndividualBase: string } };
};
type DeclaredStatement = {
  engagementId: string; source: ApprovedSource;
  items: { code: string; direction: string; amount: string }[];
  allocations: { kind: string; net: string; withheld: string | null; taxable: string | null }[];
};

const officialReceipt = /^1\.\d\.\d{19}$/;
const officialCode = /^[0-9A-Za-z_-]{1,30}$/;

function statementIdentifier(engagementId: string, kind = 'regular') {
  return 'D' + createHash('sha256').update(engagementId + (kind === 'advance' ? '/advance' : '')).digest('hex').slice(0, 26);
}

function statementInstallments(row: DeclaredStatement) {
  const items = row.items.filter(item => ['earning', 'deduction'].includes(item.direction) && toCents(item.amount) > 0n);
  if (row.allocations.length === 1 && row.allocations[0].kind === 'regular') return [
    { id: statementIdentifier(row.engagementId), items },
  ];
  const advance = row.allocations.find(payment => payment.kind === 'advance');
  const balance = row.allocations.find(payment => payment.kind === 'balance');
  if (row.allocations.length !== 2 || !advance?.withheld || !advance.taxable || !balance?.withheld) {
    throw new PayrollError(422, 'Confira as parcelas e a vinculação dos demonstrativos à escrituração.');
  }
  const gross = centsText(toCents(advance.net) + toCents(advance.withheld));
  const timing = toCents(advance.taxable) > 0n ? 'CROSS_MONTH' : 'SAME_MONTH';
  return [
    { id: statementIdentifier(row.engagementId, 'advance'), items: [
      { code: 'SALARY_ADVANCE_' + timing, amount: gross },
      { code: 'IRRF', amount: advance.withheld },
    ] },
    { id: statementIdentifier(row.engagementId), items: [
      ...items.filter(item => item.code !== 'IRRF'),
      { code: 'SALARY_ADVANCE_OFFSET_' + timing, amount: gross },
      { code: 'IRRF', amount: balance.withheld },
    ] },
  ];
}

function scope(context: PayrollContext) { return [context.company.id, context.user.tenantId, context.officeId]; }
function hasAuthorization(settings: Settings, permission: 'registration' | 'payroll') {
  return Boolean(settings.authorization && settings.authorization.expiresOn >= new Date().toISOString().slice(0, 10)
    && settings.authorization.scopes.includes(permission));
}
function environmentFor(value: string): Environment {
  if (value !== 'restricted' && value !== 'production') throw new PayrollError(404, 'Ambiente do eSocial não encontrado.');
  return value;
}
function competenceFor(value: string) {
  const competence = value + '-01';
  if (!isCivilDate(competence)) throw new PayrollError(422, 'Informe a competência no formato AAAA-MM.');
  return competence;
}
function registrationRoot(context: PayrollContext) {
  if (context.company.identification_type !== 'cnpj' || !/^[0-9A-Z]{12}\d{2}$/.test(context.company.tax_id)) {
    throw new PayrollError(422, 'Informe um CNPJ de empregador válido.');
  }
  return context.company.tax_id.slice(0, 8);
}
async function lockEmployer(client: DbClient, context: PayrollContext) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [JSON.stringify(['payroll-employer', context.user.tenantId, context.officeId, registrationRoot(context)])]);
}
async function employerFor(client: DbClient, context: PayrollContext) {
  const { rows: [employer] } = await client.query<{ id: string }>(
    'SELECT employer_id AS id FROM payroll_employer_memberships WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3', scope(context),
  );
  return employer?.id ?? null;
}

function readSettings(raw: unknown, root: string): Settings {
  const body = asPayrollRecord(raw);
  const employerReceipt = payrollText(body.employerReceipt);
  const rawAuthorization = asPayrollRecord(body.authorization);
  const reference = payrollText(rawAuthorization.reference);
  const method = payrollText(rawAuthorization.method);
  const verifiedOn = payrollText(rawAuthorization.verifiedOn);
  const expiresOn = payrollText(rawAuthorization.expiresOn);
  const scopes = Array.isArray(rawAuthorization.scopes) ? [...new Set(rawAuthorization.scopes.map(payrollText))] : [];
  const authorization = method || reference || verifiedOn || expiresOn || scopes.length ? { method, reference, verifiedOn, expiresOn, scopes } : null;
  if (authorization && (!['employer_certificate', 'proxy'].includes(method) || !reference || reference.length > 200
    || !isCivilDate(verifiedOn) || !isCivilDate(expiresOn) || expiresOn < verifiedOn || verifiedOn > new Date().toISOString().slice(0, 10)
    || !scopes.length || scopes.some(scope => !['registration', 'payroll'].includes(scope)))) {
    throw new PayrollError(422, 'Confira a autorização verificada, as datas e os perfis do eSocial.');
  }
  if (employerReceipt.length > 200 || !Array.isArray(body.establishments)) {
    throw new PayrollError(422, 'Confira a referência S-1000 e os estabelecimentos.');
  }
  const establishments = body.establishments.map(value => {
    const row = asPayrollRecord(value);
    const registration = payrollText(row.registration).replace(/[.\/-]/g, '').toUpperCase();
    const receipt = payrollText(row.receipt);
    if (!registration.startsWith(root) || !/^[0-9A-Z]{12}\d{2}$/.test(registration)
      || receipt.length > 200 || !Array.isArray(row.allocations)) {
      throw new PayrollError(422, 'Confira as inscrições dos estabelecimentos e seus recibos.');
    }
    const allocations = row.allocations.map(value => {
      const row = asPayrollRecord(value);
      const code = payrollText(row.code);
      const receipt = payrollText(row.receipt);
      if (!code || code.length > 30 || receipt.length > 200) throw new PayrollError(422, 'Confira os códigos e recibos das lotações.');
      return { code, receipt };
    });
    if (new Set(allocations.map(row => row.code)).size !== allocations.length) {
      throw new PayrollError(422, 'Há lotações repetidas no estabelecimento.');
    }
    return { registration, receipt, allocations };
  });
  if (new Set(establishments.map(row => row.registration)).size !== establishments.length) {
    throw new PayrollError(422, 'Há estabelecimentos repetidos.');
  }
  return { employerReceipt, authorization, establishments };
}

async function readiness(client: DbClient, context: PayrollContext, environment: Environment) {
  const employerId = await employerFor(client, context);
  const { rows: [setting] } = await client.query<{ data: Settings }>(
    'SELECT data FROM payroll_employer_settings WHERE employer_id = $1 AND tenant_id = $2 AND office_id = $3 AND environment = $4',
    [employerId, context.user.tenantId, context.officeId, environment],
  );
  const settings = setting?.data ?? { employerReceipt: '', establishments: [], authorization: null };
  const issues: string[] = [];
  if (!settings.employerReceipt) issues.push('Registre a referência oficial do cadastro S-1000.');
  if (!hasAuthorization(settings, 'payroll')) issues.push('Confira a autorização vigente para folha no ambiente selecionado.');
  if (!settings.establishments.length) issues.push('Mapeie os estabelecimentos e as lotações tributárias.');
  for (const establishment of settings.establishments) {
    if (!establishment.receipt || !establishment.allocations.length || establishment.allocations.some(row => !row.receipt)) {
      issues.push(`Confira os recibos S-1005 e S-1020 do estabelecimento ${establishment.registration}.`);
    }
  }
  const { rows: links } = await client.query<{ registration: string | null; allocation: string | null }>(
    `SELECT establishment_registration AS registration, tax_allocation_code AS allocation FROM payroll_engagements
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND kind = 'employee' AND status = 'active'`, scope(context),
  );
  if (links.some(link => !settings.establishments.some(establishment =>
    establishment.registration === link.registration && establishment.allocations.some(row => row.code === link.allocation)))) {
    issues.push('Há funcionários ativos com estabelecimento ou lotação fora do mapeamento.');
  }
  return { environment, employerId, settings, issues, ready: issues.length === 0 };
}

async function findDelivery(client: DbClient, context: PayrollContext, environment: Environment, competence: string) {
  const employerId = await employerFor(client, context);
  const { rows: [delivery] } = await client.query<Delivery>(
    `SELECT id, mode, cardinality(pending_reconciliation) AS "pendingCount" FROM payroll_deliveries
      WHERE employer_id = $1 AND tenant_id = $2 AND office_id = $3 AND environment = $4 AND competence = $5`,
    [employerId, context.user.tenantId, context.officeId, environment, competence],
  );
  return { employerId, delivery };
}

const eventColumns = `id, event_key AS "eventKey", event_type AS "eventType", version_id AS "versionId", origin,
  status, protocol, receipt, outcome`;

async function verifyApprovedVersion(client: DbClient, context: PayrollContext, versionId: string, competence: string, payment = false) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM payroll_versions v JOIN payroll_periods p ON p.id = v.period_id
      WHERE v.company_id = $1 AND v.tenant_id = $2 AND v.office_id = $3 AND v.id = $4 AND v.approved_at IS NOT NULL
        AND (p.competence = $5 OR ($6::boolean AND p.competence < $5))`,
    [...scope(context), versionId, competence, payment],
  );
  if (!rowCount) throw new PayrollError(422, 'Selecione a versão aprovada da folha.');
}

async function acceptedSource(client: DbClient, context: PayrollContext, environment: Environment, eventId: string, type: string,
  month: string, cpf?: string, versionId?: string) {
  const { rows: [event] } = await client.query<{ receipt: string; versionId: string; origin: string; signedXml: string | null }>(
    `SELECT e.receipt, e.version_id AS "versionId", e.origin, e.signed_xml AS "signedXml"
      FROM payroll_events e JOIN payroll_deliveries d ON d.id = e.delivery_id
      WHERE e.company_id = $1 AND e.tenant_id = $2 AND e.office_id = $3 AND e.id = $4
        AND e.environment = $5 AND e.event_type = $6 AND d.competence = $7 AND e.status = 'accepted'
        AND ($8::text IS NULL OR e.outcome->>'beneficiaryCpf' = $8) AND ($9::text IS NULL OR e.version_id = $9)`,
    [...scope(context), eventId, environment, type, competenceFor(month), cpf ?? null, versionId ?? null],
  );
  if (!event || !officialReceipt.test(event.receipt)) {
    throw new PayrollError(422, 'Selecione o evento de origem aceito, com recibo oficial no mesmo ambiente.');
  }
  return event;
}

async function remunerationDraft(client: DbClient, context: PayrollContext, header: EsocialHeader, month: string, versionId: string,
  cpf: string, input: Record<string, unknown>) {
  await verifyApprovedVersion(client, context, versionId, competenceFor(month));
  const { rows: statements } = await client.query<DeclaredStatement>(
    `SELECT s.engagement_id AS "engagementId", s.items, entry.value AS source,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', pay.kind, 'net', pay.amount::text,
            'withheld', pay.withheld_income_tax::text, 'taxable', pay.taxable_amount::text) ORDER BY pay.due_on), '[]')
          FROM payroll_payments pay WHERE pay.statement_id = s.id) AS allocations
       FROM payroll_statements s JOIN payroll_versions v ON v.id = s.version_id
       JOIN LATERAL jsonb_array_elements(v.inputs#>'{sources,entries}') entry(value)
         ON entry.value->>'id' = s.engagement_id
       WHERE s.company_id = $1 AND s.tenant_id = $2 AND s.office_id = $3 AND s.version_id = $4
         AND entry.value#>>'{declaration,cpf}' = $5 ORDER BY s.reference`, [...scope(context), versionId, cpf],
  );
  if (!statements.length) throw new PayrollError(422, 'A versão aprovada precisa conter os dados de escrituração deste CPF.');
  if (statements.some(row => row.source.input.vacations?.length
    || row.source.input.fiscal.previousEmployeeBase !== '0' || row.source.input.fiscal.previousIndividualBase !== '0')) {
    throw new PayrollError(422, 'Este demonstrativo exige escrituração das férias ou das contribuições em outra fonte.');
  }
  const original = payrollText(input.originalEventId);
  if (original) {
    const source = await acceptedSource(client, context, header.environment, original, 'S-1200', month, cpf);
    if (source.versionId === versionId) throw new PayrollError(422, 'Selecione uma versão de correção da folha.');
    header = { ...header, receipt: source.receipt };
  }
  const { settings } = await readiness(client, context, header.environment);
  const mappings = asPayrollRecord(input.rubrics);
  const locations = asPayrollRecord(input.locations);
  const rows = statements.flatMap(row => {
    const source = row.source.declaration!;
    const location = asPayrollRecord(locations[row.engagementId]);
    const establishment = source.establishment ?? payrollText(location.establishment);
    const allocation = source.allocation ?? payrollText(location.allocation);
    const mapped = settings.establishments.some(item => item.registration === establishment && item.receipt
      && item.allocations.some(candidate => candidate.code === allocation && candidate.receipt));
    if (!mapped) throw new PayrollError(422, 'Confira o estabelecimento e a lotação do demonstrativo.');
    const exposure = payrollText(location.harmfulExposure);
    const simpleIndicator = payrollText(location.simpleIndicator);
    if (!['1', '2', '3', '4'].includes(exposure) || (simpleIndicator && !['1', '2', '3'].includes(simpleIndicator))) {
      throw new PayrollError(422, 'Confira o grau de exposição e o indicador do Simples do demonstrativo.');
    }
    return statementInstallments(row).map(part => {
      const items = part.items.filter(item => toCents(item.amount) > 0n).map(item => {
        const mapping = asPayrollRecord(mappings[item.code]);
        const code = payrollText(mapping.code);
        const table = payrollText(mapping.table);
        if (!officialCode.test(code) || !/^[0-9A-Za-z_-]{1,8}$/.test(table) || !officialReceipt.test(payrollText(mapping.receipt))) {
          throw new PayrollError(422, 'Confira o código, a tabela e o recibo S-1010 da rubrica ' + item.code + '.');
        }
        return { code, table, amount: item.amount };
      });
      return { id: part.id, registration: source.category === 723 && !source.registeredPartner ? undefined : source.registration ?? undefined,
        category: String(source.category), establishment, allocation, items, harmfulExposure: exposure,
        incomeTaxSimpleIndicator: simpleIndicator || undefined };
    });
  });
  const unregisteredPartner = statements.find(row => row.source.declaration?.category === 723 && !row.source.declaration.registeredPartner);
  const person = unregisteredPartner?.source;
  return payrollRemuneration(header, month, { cpf, name: person?.fullName, birthDate: person?.declaration?.birthDate ?? undefined }, rows);
}

async function paymentDraft(client: DbClient, context: PayrollContext, header: EsocialHeader,
  month: string, cpf: string, input: Record<string, unknown>) {
  const { rows: payments } = await client.query<{
    id: string; versionId: string; sourceMonth: string; paidOn: string; net: string; kind: string; engagementId: string;
  }>(
    `SELECT pay.id, s.engagement_id AS "engagementId", pay.paid_on::text AS "paidOn", pay.paid_amount::text AS net,
        v.id AS "versionId", to_char(p.competence, 'YYYY-MM') AS "sourceMonth", pay.kind
      FROM payroll_payments pay JOIN payroll_statements s ON s.id = pay.statement_id
      JOIN payroll_versions v ON v.id = s.version_id JOIN payroll_periods p ON p.id = v.period_id
      JOIN LATERAL jsonb_array_elements(v.inputs#>'{sources,entries}') entry(value) ON entry.value->>'id' = s.engagement_id
      WHERE pay.company_id = $1 AND pay.tenant_id = $2 AND pay.office_id = $3
        AND pay.paid_on >= $4::date AND pay.paid_on < $4::date + interval '1 month'
        AND entry.value#>>'{declaration,cpf}' = $5 AND v.approved_at IS NOT NULL ORDER BY pay.paid_on, pay.id`,
    [...scope(context), competenceFor(month), cpf],
  );
  if (!payments.length) throw new PayrollError(422, 'Não há pagamentos confirmados para este CPF no mês selecionado.');
  if (payments.some(row => !['regular', 'advance', 'balance'].includes(row.kind))) {
    throw new PayrollError(422, 'Confira a escrituração de cada parcela e de seu demonstrativo de origem.');
  }
  const original = payrollText(input.originalEventId);
  if (original) {
    const source = await acceptedSource(client, context, header.environment, original, 'S-1210', month, cpf);
    header = { ...header, receipt: source.receipt };
  }
  const sources = asPayrollRecord(input.sources);
  const rows = [];
  for (const payment of payments) {
    const reference = asPayrollRecord(sources[payment.id]);
    const source = await acceptedSource(client, context, header.environment,
      payrollText(reference.eventId), 'S-1200', payment.sourceMonth, cpf, payment.versionId);
    const statementId = payrollText(reference.statementId);
    if (!officialCode.test(statementId)) throw new PayrollError(422, 'Confirme o identificador oficial do demonstrativo de origem.');
    if (source.origin === 'integrated' && (statementId !== statementIdentifier(payment.engagementId, payment.kind)
      || !source.signedXml?.includes('<ideDmDev>' + statementId + '</ideDmDev>'))) {
      throw new PayrollError(422, 'O demonstrativo não consta no S-1200 integrado de origem.');
    }
    rows.push({ paidOn: payment.paidOn, sourceMonth: payment.sourceMonth, statementId, net: payment.net });
  }
  return payrollPayments(header, month, cpf, rows);
}

async function registrationDocument(client: DbClient, context: PayrollContext, header: EsocialHeader, kind: string, id: string) {
  if (kind === 'vacations') {
    const [vacation] = await readVacations(client, context, { id });
    if (!vacation) throw new PayrollError(404, 'Programação de férias não encontrada.');
    const engagement = await getEngagement(client, context, 'employee', vacation.engagementId);
    return temporaryLeave(header, readEngagement(engagement, 'employee'), {
      startsOn: vacation.startsOn, reason: '15', endsOn: vacation.endsOn,
    });
  }
  if (kind !== 'employee' && kind !== 'partner') throw new PayrollError(404, 'Tipo de vínculo não encontrado.');
  const engagement = await getEngagement(client, context, kind, id);
  if (engagement.status === 'draft') throw new PayrollError(422, 'Valide o vínculo antes de montar o evento.');
  const link = readEngagement(engagement, kind);
  const compensation = engagement.compensation.find(row =>
    row.startsOn <= link.startsOn && (!row.endsOn || row.endsOn >= link.startsOn));
  const issues = admissionIssues(link, kind, Boolean(compensation));
  if (Object.keys(issues).length || !compensation) throw new PayrollError(422, 'Confira os dados do vínculo.', issues);
  const { rows: dependents } = await client.query<EsocialDependent>(
    `SELECT cpf, full_name AS "fullName", birth_date::text AS "birthDate", relationship,
      relationship_description AS "relationshipDescription", income_tax AS "incomeTax", family_allowance AS "familyAllowance"
      FROM payroll_dependents WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND person_id = $4
        AND starts_on <= $5::date AND (ends_on IS NULL OR ends_on >= $5::date) ORDER BY id`,
    [...scope(context), engagement.personId, link.startsOn],
  );
  try {
    return kind === 'employee' ? employeeAdmission(header, link, compensation, dependents)
      : partnerRegistration(header, link, dependents);
  } catch {
    throw new PayrollError(422, 'Confira a modalidade de admissão ou a opção de cadastro do sócio no eSocial.');
  }
}

async function validatedSignature(document: EsocialDocument, environment: Environment) {
  const config = await esocialConfiguration(environment);
  if (!config) throw new PayrollError(503, 'O ambiente ainda precisa de certificado e esquemas XSD.');
  try {
    const signed = signEsocialDocument(document, config.credential);
    await validateEsocialDocument(signed, config.schemas);
    return signed;
  } catch {
    throw new PayrollError(422, 'Confira os campos do evento, o certificado e a versão dos esquemas XSD.');
  }
}

const router = Router({ mergeParams: true });
const registrationPath = '/:environment/registration/:kind(employee|partner|vacations)/:id';

router.get(registrationPath + '/xml', payrollAction('transmit', async (client, context, request) => {
  const root = registrationRoot(context);
  const header = { root, environment: environmentFor(request.params.environment), id: esocialEventId(root, new Date(), 1) };
  const { kind, id } = request.params;
  return { ...await registrationDocument(client, context, header, kind, id), draft: true };
}, (response, data) => { response.set('Cache-Control', 'private, no-store').json(data); }));

router.get(registrationPath + '/events', payrollAction('read', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const { kind, id } = request.params;
  return (await client.query<Event>(
    `SELECT ${eventColumns} FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
       AND environment = $4 AND delivery_id IS NULL AND outcome->>'subject' = $5 ORDER BY created_at, id`,
    [...scope(context), environment, kind + '/' + id],
  )).rows;
}));

router.post(registrationPath + '/queue', payrollAction('transmit', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const { kind, id } = request.params;
  const subject = kind + '/' + id;
  await lockEmployer(client, context);
  const { employerId, settings } = await readiness(client, context, environment);
  if (!employerId || !settings.employerReceipt || !hasAuthorization(settings, 'registration')) {
    throw new PayrollError(422, 'Confira o cadastro do empregador e a autorização vigente para eventos cadastrais.');
  }
  const root = registrationRoot(context);
  const header = { root, environment, id: esocialEventId(root, new Date(), randomInt(1, 100000)) };
  const document = await registrationDocument(client, context, header, kind, id);
  const key = createHash('sha256').update(JSON.stringify([subject, document.xml.replace(header.id, '')])).digest('hex');
  const { rows: events } = await client.query<Event & { submissionKey: string }>(
    `SELECT ${eventColumns}, submission_key AS "submissionKey" FROM payroll_events
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND environment = $4 AND delivery_id IS NULL
        AND outcome->>'subject' = $5`, [...scope(context), environment, subject],
  );
  const existing = events.find(event => event.submissionKey === key);
  if (existing) return existing;
  if (events.some(event => ['queued', 'sent', 'indeterminate', 'accepted'].includes(event.status))) {
    throw new PayrollError(409, 'O cadastro já tem evento pendente ou recibo vigente.');
  }
  const signed = await validatedSignature(document, environment);
  const type = kind === 'employee' ? 'S-2200' : kind === 'partner' ? 'S-2300' : 'S-2230';
  const { rows: [saved] } = await client.query<Event>(
    `INSERT INTO payroll_events (company_id, tenant_id, office_id, employer_id, environment, event_type, event_key,
      origin, status, layout_version, outcome, signed_xml, submission_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'integrated','queued','S-1.3',$8,$9,$10) RETURNING ${eventColumns}`,
    [...scope(context), employerId, environment, type, signed.id, { schema: signed.schema, subject }, signed.xml, key],
  );
  return saved;
}, (response, data) => { response.status(201).json(data); }));

router.get('/:environment/settings', payrollAction('read', (client, context, request) =>
  readiness(client, context, environmentFor(request.params.environment))));

router.put('/:environment/settings', payrollAction('transmit', async (client, context, request) => {
  if (context.user.role !== 'owner') throw new PayrollError(403, 'Somente o proprietário pode alterar o preparo do declarante.');
  const environment = environmentFor(request.params.environment);
  const root = registrationRoot(context);
  const settings = readSettings(request.body, root);
  await lockEmployer(client, context);
  const office = [context.user.tenantId, context.officeId];
  await client.query('INSERT INTO payroll_employers (tenant_id, office_id, registration_root) VALUES ($1, $2, $3) ON CONFLICT (office_id, registration_root) DO NOTHING',
    [...office, root]);
  const { rows: [{ id: employerId }] } = await client.query<{ id: string }>(
    'SELECT id FROM payroll_employers WHERE tenant_id = $1 AND office_id = $2 AND registration_root = $3', [...office, root],
  );
  await client.query(
    `INSERT INTO payroll_employer_memberships (company_id, tenant_id, office_id, employer_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, tenant_id, office_id) DO NOTHING`, [...scope(context), employerId],
  );
  if (await employerFor(client, context) !== employerId) throw new PayrollError(409, 'A empresa já está vinculada a outro declarante.');
  await client.query(
    'UPDATE payroll_engagements SET employer_id = $4 WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND employer_id IS NULL',
    [...scope(context), employerId],
  );
  await client.query(
    `INSERT INTO payroll_employer_settings (employer_id, tenant_id, office_id, environment, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (employer_id, environment) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [employerId, ...office, environment, settings],
  );
  return readiness(client, context, environment);
}));

router.get('/:environment/deliveries/:month', payrollAction('read', async (client, context, request) => {
  const { delivery } = await findDelivery(client, context, environmentFor(request.params.environment), competenceFor(request.params.month));
  const events = delivery ? (await client.query<Event>(
    `SELECT ${eventColumns} FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND delivery_id = $4 ORDER BY created_at, id`, [...scope(context), delivery.id],
  )).rows : [];
  return { delivery: delivery ?? null, events };
}));

async function periodicDocument(client: DbClient, context: PayrollContext, header: EsocialHeader, month: string,
  body: Record<string, unknown>) {
  const { environment } = header;
  const competence = competenceFor(month);
  const type = payrollText(body.eventType);
  const versionId = payrollText(body.versionId);
  const cpf = payrollText(body.beneficiaryCpf);
  if (!['S-1200', 'S-1210', 'S-1298', 'S-1299'].includes(type)) {
    throw new PayrollError(422, 'Selecione um evento periódico válido.');
  }
  if (['S-1200', 'S-1210'].includes(type) && !isValidCpf(cpf)) {
    throw new PayrollError(422, 'Selecione o CPF do beneficiário.');
  }
  if (type === 'S-1200') return remunerationDraft(client, context, header, month, versionId, cpf, body);
  if (type === 'S-1210') return paymentDraft(client, context, header, month, cpf, body);
  await verifyApprovedVersion(client, context, versionId, competence);
  if (type === 'S-1298') {
    await acceptedSource(client, context, environment, payrollText(body.originalEventId), 'S-1299', month);
    return payrollReopening(header, month);
  }
  if (type === 'S-1299') {
    const { delivery } = await findDelivery(client, context, environment, competence);
    if (!delivery) throw new PayrollError(422, 'Configure a entrega antes de preparar o fechamento.');
    const included = asPayrollRecord(body.included);
    if (typeof included.remuneration !== 'boolean' || typeof included.payments !== 'boolean'
      || typeof included.ruralProduction !== 'boolean' || typeof included.unionWorkers !== 'boolean'
      || typeof included.complementaryInformation !== 'boolean') {
      throw new PayrollError(422, 'Confirme os eventos que compõem o fechamento do declarante.');
    }
    return payrollClosing(header, month, {
      remuneration: included.remuneration, payments: included.payments, ruralProduction: included.ruralProduction,
      unionWorkers: included.unionWorkers, complementaryInformation: included.complementaryInformation,
    });
  }
  throw new PayrollError(422, 'Selecione um evento periódico válido.');
}

router.post('/:environment/deliveries/:month/xml', payrollAction('transmit', async (client, context, request) => {
  const root = registrationRoot(context);
  const environment = environmentFor(request.params.environment);
  const header = { root, environment, id: esocialEventId(root, new Date(), 1) };
  return { ...await periodicDocument(client, context, header, request.params.month, asPayrollRecord(request.body)), draft: true };
}, (response, data) => { response.set('Cache-Control', 'private, no-store').json(data); }));

router.post('/:environment/deliveries/:month/queue', payrollAction('transmit', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const { month } = request.params;
  const competence = competenceFor(month);
  const body = asPayrollRecord(request.body);
  const type = payrollText(body.eventType);
  const versionId = payrollText(body.versionId);
  await lockEmployer(client, context);
  const { employerId, delivery } = await findDelivery(client, context, environment, competence);
  if (delivery?.mode !== 'integrated') throw new PayrollError(409, 'Selecione entrega integrada antes de preparar a fila.');
  const { ready, settings } = await readiness(client, context, environment);
  if (!ready) throw new PayrollError(422, 'Confira as autorizações e os cadastros do ambiente.');
  if (settings.establishments.length !== 1) {
    throw new PayrollError(422, 'A preparação integrada desta entrega exige a consolidação dos estabelecimentos.');
  }
  await verifyApprovedVersion(client, context, versionId, competence, type === 'S-1210');
  const root = registrationRoot(context);
  const header = { root, environment, id: esocialEventId(root, new Date(), randomInt(1, 100000)) };
  const document = await periodicDocument(client, context, header, month, body);
  const { rows: closures } = await client.query<{ id: string; type: string }>(
    `SELECT id, event_type AS type FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND delivery_id = $4 AND status = 'accepted' AND event_type IN ('S-1298', 'S-1299') ORDER BY updated_at DESC, id DESC`,
    [...scope(context), delivery.id],
  );
  const current = closures[0];
  const originalEventId = payrollText(body.originalEventId);
  const sourceEventId = type === 'S-1299' ? closures.find(event => event.type === 'S-1298')?.id : originalEventId;
  const key = createHash('sha256').update(JSON.stringify([type, month, versionId, sourceEventId, document.xml.replace(header.id, '')])).digest('hex');
  const { rows: [existing] } = await client.query<Event>(
    `SELECT ${eventColumns} FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND delivery_id = $4 AND submission_key = $5`, [...scope(context), delivery.id, key],
  );
  if (existing) return existing;
  if (type === 'S-1298' && (current?.type !== 'S-1299' || current.id !== originalEventId)) {
    throw new PayrollError(409, 'Selecione o fechamento oficial vigente para reabrir a entrega.');
  }
  if (type !== 'S-1298' && current?.type === 'S-1299') {
    throw new PayrollError(409, 'Reabra a entrega oficialmente antes de preparar novos eventos.');
  }
  if (type === 'S-1299' && delivery.pendingCount) {
    throw new PayrollError(422, 'Concilie os eventos pendentes antes de preparar o fechamento.');
  }
  const beneficiaryCpf = payrollText(body.beneficiaryCpf);
  const replacesReceipt = /<nrRecibo>([^<]+)<\/nrRecibo>/.exec(document.xml)?.[1] ?? null;
  const { rowCount: conflicts } = await client.query(
    `SELECT 1 FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND delivery_id = $4 AND event_type = $5 AND coalesce(outcome->>'beneficiaryCpf', '') = $6
      AND (status IN ('queued', 'sent', 'indeterminate') OR (status = 'accepted' AND event_type IN ('S-1200','S-1210')
        AND receipt IS DISTINCT FROM $7
        AND NOT EXISTS (SELECT 1 FROM payroll_events next WHERE next.delivery_id = $4 AND next.status = 'accepted'
          AND next.replaces_receipt = payroll_events.receipt)))`,
    [...scope(context), delivery.id, type, beneficiaryCpf, replacesReceipt],
  );
  if (conflicts) throw new PayrollError(409, 'Este evento já tem envio pendente ou recibo vigente.');
  const signed = await validatedSignature(document, environment);
  const { rows: [event] } = await client.query<Event>(
    `INSERT INTO payroll_events (company_id, tenant_id, office_id, employer_id, delivery_id, version_id, environment,
      event_type, event_key, origin, status, layout_version, replaces_receipt, outcome, signed_xml, submission_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'integrated','queued','S-1.3',$10,$11,$12,$13)
      RETURNING ${eventColumns}`, [...scope(context), employerId, delivery.id, versionId, environment, type, signed.id,
      replacesReceipt, { ...(beneficiaryCpf ? { beneficiaryCpf } : {}), schema: signed.schema, sourceEventId }, signed.xml, key],
  );
  await client.query(
    'UPDATE payroll_deliveries SET pending_reconciliation = array_append(pending_reconciliation, $4) WHERE id = $1 AND tenant_id = $2 AND office_id = $3',
    [delivery.id, context.user.tenantId, context.officeId, event.id],
  );
  return event;
}, (response, data) => { response.status(201).json(data); }));

router.put('/:environment/deliveries/:month', payrollAction('transmit', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const competence = competenceFor(request.params.month);
  const input = asPayrollRecord(request.body);
  const mode = payrollText(input.mode);
  if (mode !== 'external' && mode !== 'integrated') throw new PayrollError(422, 'Selecione o responsável pela entrega.');
  await lockEmployer(client, context);
  const { employerId, delivery } = await findDelivery(client, context, environment, competence);
  if (!employerId) throw new PayrollError(422, 'Prepare o cadastro do declarante primeiro.');
  await verifyApprovedVersion(client, context, payrollText(input.versionId), competence);
  if (delivery && delivery.mode !== mode && delivery.pendingCount > 0) {
    throw new PayrollError(409, 'Concilie os eventos existentes antes de trocar o responsável pela entrega.');
  }
  if (mode === 'integrated' && !(await readiness(client, context, environment)).ready) {
    throw new PayrollError(422, 'Resolva as pendências do declarante antes de selecionar envio integrado.');
  }
  await client.query(
    `INSERT INTO payroll_deliveries (employer_id, tenant_id, office_id, environment, competence, mode)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (employer_id, environment, competence) DO UPDATE SET mode = EXCLUDED.mode`,
    [employerId, context.user.tenantId, context.officeId, environment, competence, mode],
  );
  return (await findDelivery(client, context, environment, competence)).delivery;
}));

router.post('/:environment/deliveries/:month/events', payrollAction('transmit', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const competence = competenceFor(request.params.month);
  const input = asPayrollRecord(request.body);
  const versionId = payrollText(input.versionId);
  const eventKey = payrollText(input.eventKey);
  const eventType = payrollText(input.eventType);
  const status = payrollText(input.status);
  const receipt = payrollText(input.receipt) || null;
  const protocol = payrollText(input.protocol) || null;
  const evidence = payrollText(input.evidence);
  const beneficiaryCpf = payrollText(input.beneficiaryCpf);
  if (!/^[0-9A-Za-z_-]{1,100}$/.test(eventKey) || !['S-1200', 'S-1210', 'S-1298', 'S-1299'].includes(eventType)
    || !['reported', 'sent', 'indeterminate', 'accepted', 'rejected'].includes(status)
    || (status === 'accepted' && !receipt) || !evidence || evidence.length > 1000
    || (beneficiaryCpf && (!['S-1200', 'S-1210'].includes(eventType) || !isValidCpf(beneficiaryCpf)))
    || (receipt?.length ?? 0) > 200 || (protocol?.length ?? 0) > 200) {
    throw new PayrollError(422, 'Confirme a identificação, a situação e a evidência do evento externo.');
  }
  await lockEmployer(client, context);
  const { employerId, delivery } = await findDelivery(client, context, environment, competence);
  if (delivery?.mode !== 'external') throw new PayrollError(409, 'Selecione envio externo para registrar este evento.');
  await verifyApprovedVersion(client, context, versionId, competence, eventType === 'S-1210');
  const { rows: [event] } = await client.query<Event>(
    `INSERT INTO payroll_events (company_id, tenant_id, office_id, employer_id, delivery_id, version_id, environment,
       event_type, event_key, origin, status, protocol, receipt, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'external', $10, $11, $12, $13)
     ON CONFLICT (employer_id, environment, event_key) DO NOTHING RETURNING ${eventColumns}`,
    [...scope(context), employerId, delivery.id, versionId, environment, eventType, eventKey, status, protocol, receipt,
      { evidence, ...(beneficiaryCpf ? { beneficiaryCpf } : {}) }],
  );
  if (!event) {
    const { rows: [existing] } = await client.query<Event>(
      `SELECT ${eventColumns} FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
        AND delivery_id = $4 AND event_key = $5`, [...scope(context), delivery.id, eventKey],
    );
    if (existing?.origin === 'external' && existing.versionId === versionId && existing.eventType === eventType
      && existing.status === status && existing.receipt === receipt && existing.protocol === protocol && existing.outcome?.evidence === evidence
      && (existing.outcome?.beneficiaryCpf ?? '') === beneficiaryCpf) return existing;
    throw new PayrollError(409, 'O identificador já foi registrado para este declarante e ambiente.');
  }
  await client.query(
    'UPDATE payroll_deliveries SET pending_reconciliation = array_append(pending_reconciliation, $4) WHERE id = $1 AND tenant_id = $2 AND office_id = $3',
    [delivery.id, context.user.tenantId, context.officeId, event.id],
  );
  return event;
}, (response, row) => { response.status(201).json(row); }));

router.put('/:environment/deliveries/:month/events/:id/reconcile', payrollAction('transmit', async (client, context, request) => {
  const environment = environmentFor(request.params.environment);
  const competence = competenceFor(request.params.month);
  const input = asPayrollRecord(request.body);
  const status = payrollText(input.status);
  const receipt = payrollText(input.receipt) || null;
  const protocol = payrollText(input.protocol) || null;
  const evidence = payrollText(input.evidence);
  if (!['accepted', 'rejected'].includes(status) || (status === 'accepted' && !receipt) || (status === 'rejected' && !protocol)
    || !evidence || evidence.length > 1000 || (receipt?.length ?? 0) > 200 || (protocol?.length ?? 0) > 200) {
    throw new PayrollError(422, 'Informe a situação final e sua evidência oficial.');
  }
  await lockEmployer(client, context);
  const { delivery } = await findDelivery(client, context, environment, competence);
  if (delivery?.mode !== 'external') throw new PayrollError(409, 'A conciliação externa exige uma entrega em modo externo.');
  const { rows: [event] } = await client.query<Event>(
    `SELECT ${eventColumns} FROM payroll_events WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
      AND delivery_id = $4 AND id = $5 AND origin = 'external'`, [...scope(context), delivery.id, request.params.id],
  );
  if (!event) throw new PayrollError(404, 'Evento externo não encontrado.');
  if (event.status === 'accepted' && (status !== 'accepted' || receipt !== event.receipt)) {
    throw new PayrollError(409, 'O recibo aceito deve ser preservado para retificação.');
  }
  await client.query(
    `UPDATE payroll_events SET status = $5, receipt = $6, protocol = coalesce($7, protocol),
      outcome = coalesce(outcome, '{}') || $8, updated_at = now()
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4`,
    [...scope(context), event.id, status, receipt, protocol, { reconciliation: evidence }],
  );
  await client.query(
    'UPDATE payroll_deliveries SET pending_reconciliation = array_remove(pending_reconciliation, $4) WHERE id = $1 AND tenant_id = $2 AND office_id = $3',
    [delivery.id, context.user.tenantId, context.officeId, event.id],
  );
  return { id: event.id, status, receipt };
}));

type QueuedDocument = { id: string; key: string; xml: string; schema: string; protocol: string | null; status: string };

async function saveBatchOutcome(client: DbClient, context: PayrollContext, deliveryId: string | null, documents: QueuedDocument[],
  batch: BatchOutcome | null, protocol: string | null) {
  const operation = protocol ? 'query' : 'submit';
  for (const document of documents) {
    const result = batch ? outcomeForQueuedEvent(document.key, batch, operation) : null;
    const verifiedProtocol = operation === 'submit' ? result?.protocol : document.protocol ?? (result?.result ? protocol : null);
    const state = operation === 'query' && !verifiedProtocol ? 'indeterminate'
      : result?.status ?? (operation === 'submit' ? 'indeterminate' : document.status);
    const detail = batch ? {
      code: batch.code, description: batch.description, occurrences: batch.occurrences,
      ...(result?.result ? { event: result.result } : {}),
    } : { communication: 'indeterminate' };
    const { rowCount } = await client.query(
      `UPDATE payroll_events SET status = $5, protocol = coalesce($6, protocol), receipt = $7,
        outcome = outcome || jsonb_build_object('batch', $8::jsonb, 'pollAfter', $9::text), updated_at = now()
       WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4
         AND status IN ('indeterminate','sent') AND (protocol IS NULL OR protocol = $6)`,
      [...scope(context), document.id, state, verifiedProtocol, state === 'accepted' ? result?.receipt : null,
        detail, new Date(Date.now() + Math.min(3600, Math.max(5, batch?.estimatedSeconds ?? 5)) * 1000).toISOString()],
    );
    if (deliveryId && rowCount && ['accepted', 'rejected'].includes(state)) {
      await client.query(
        'UPDATE payroll_deliveries SET pending_reconciliation = array_remove(pending_reconciliation, $4) WHERE id = $1 AND tenant_id = $2 AND office_id = $3',
        [deliveryId, context.user.tenantId, context.officeId, document.id],
      );
    }
  }
}

router.post(['/:environment/deliveries/:month/queue/:operation(dispatch|poll)',
  '/:environment/registration/queue/:operation(dispatch|poll)'], payrollAction('transmit',
  async (client, context, request) => {
    const environment = environmentFor(request.params.environment);
    const competence = request.params.month ? competenceFor(request.params.month) : null;
    const operation = request.params.operation;
    if (operation === 'dispatch' && !esocialTransmissionEnabled(environment)) {
      throw new PayrollError(503, 'A transmissão está suspensa neste ambiente.');
    }
    const config = await esocialConfiguration(environment);
    if (!config) throw new PayrollError(503, 'Configure o certificado e os esquemas XSD do ambiente.');
    const body = asPayrollRecord(request.body);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(payrollText))] : [];
    const recoveryProtocol = payrollText(body.recoveryProtocol);
    const evidence = payrollText(body.evidence);
    if (!ids.length || ids.length > 50 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new PayrollError(422, 'Selecione de 1 a 50 eventos da entrega.');
    }
    if (recoveryProtocol && (operation !== 'poll' || !esocialProtocol.test(recoveryProtocol)
      || !evidence || evidence.length > 1000)) {
      throw new PayrollError(422, 'Registre o protocolo recuperado e a evidência usada na conciliação.');
    }
    await lockEmployer(client, context);
    const delivery = competence ? (await findDelivery(client, context, environment, competence)).delivery : null;
    if (competence && delivery?.mode !== 'integrated') throw new PayrollError(409, 'A entrega não está em modo integrado.');
    if (operation === 'dispatch') {
      const { ready, settings } = await readiness(client, context, environment);
      if (competence ? !ready : !settings.employerReceipt || !hasAuthorization(settings, 'registration')) {
        throw new PayrollError(422, 'Confira as autorizações e os cadastros antes do envio.');
      }
    }
    const { rows } = await client.query<QueuedDocument & { pollAfter: string | null; eventType: string }>(
      `SELECT id, event_key AS key, status, protocol, signed_xml AS xml, outcome->>'schema' AS schema,
        outcome->>'pollAfter' AS "pollAfter", event_type AS "eventType" FROM payroll_events
       WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND delivery_id IS NOT DISTINCT FROM $4
        AND id = ANY($5::text[]) AND environment = $6 AND origin = 'integrated' AND signed_xml IS NOT NULL ORDER BY id FOR UPDATE`,
      [...scope(context), delivery?.id ?? null, ids, environment],
    );
    if (rows.length !== ids.length) throw new PayrollError(404, 'Eventos da fila não encontrados.');
    let protocol: string | null = null;
    if (operation === 'dispatch') {
      if (rows.some(row => row.status !== 'queued')) {
        throw new PayrollError(409, 'Selecione eventos na fila. Concilie tentativas anteriores antes de enviar.');
      }
      if (rows.length > 1 && rows.some(row => ['S-1299', 'S-1298'].includes(row.eventType))) {
        throw new PayrollError(422, 'Envie o fechamento ou a reabertura em lote individual.');
      }
      await client.query(
        `UPDATE payroll_events SET status = 'indeterminate', updated_at = now()
         WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = ANY($4::text[])`, [...scope(context), ids],
      );
    } else {
      const protocols = new Set(rows.map(row => row.protocol ?? recoveryProtocol));
      protocol = rows[0].protocol ?? recoveryProtocol;
      if (protocols.size !== 1 || !protocol || rows.some(row => !['sent', 'indeterminate'].includes(row.status)
        || (row.pollAfter && Date.parse(row.pollAfter) > Date.now()))) {
        throw new PayrollError(409, 'Selecione eventos pendentes do mesmo protocolo e aguarde o prazo de consulta.');
      }
      await client.query(
        `UPDATE payroll_events SET outcome = outcome || jsonb_build_object('pollAfter', $5::text, 'recoveryEvidence', $6::text)
         WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = ANY($4::text[])`,
        [...scope(context), ids, new Date(Date.now() + 30_000).toISOString(), evidence || null],
      );
    }
    return { environment, config, root: registrationRoot(context), deliveryId: delivery?.id ?? null, rows, protocol };
  }, async (response, claim, request) => {
    const adapter = esocialTransport(claim.environment, claim.config.credential);
    let result: BatchOutcome | null = null;
    try {
      result = claim.protocol ? await adapter.query(claim.protocol) : await adapter.submit(claim.root, claim.config.transmitter,
        claim.deliveryId ? 3 : 2,
        claim.rows.map(row => ({ id: row.key, xml: row.xml, schema: row.schema })));
      if (claim.protocol && result.protocol && result.protocol !== claim.protocol) result = null;
    } catch {
      // A failed exchange does not establish that the server did not receive the event.
    }
    await withPayrollContext(request.user!, request.header('X-Office-Id')!, request.params.companyId, 'transmit', async (client, context) => {
      await lockEmployer(client, context);
      await saveBatchOutcome(client, context, claim.deliveryId, claim.rows, result, claim.protocol);
    });
    response.status(result ? 200 : 202).json({
      result: result ? 'recorded' : 'pending_reconciliation', eventIds: claim.rows.map(row => row.id),
    });
  }));

export default router;
