import { Router } from 'express';
import { DbClient } from '../config/database';
import { admissionIssues, Details, EngagementKind, readCompensation, readEngagement, validateEngagementDraft } from '../domain/payrollPeople';
import { isValidCpf, normalizeTaxId } from '../domain/taxIdentification';
import { PayrollContext, PayrollError, payrollAction } from '../middlewares/payroll';
import payrollConditions from './payrollConditions';
import { lockPayrollCompany } from './payrollPolicies';

type Person = { cpf: string; fullName: string; birthDate: string | null; details: Details };
type Compensation = { id: string; amount: string; unit: string; startsOn: string; endsOn: string | null };
type Engagement = {
  id: string;
  personId: string;
  kind: EngagementKind;
  registration: string | null;
  categoryCode: string | null;
  establishmentRegistration: string | null;
  taxAllocationCode: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: 'draft' | 'active' | 'ended';
  details: Details;
  person: Person;
  compensation: Compensation[];
};

function scope(context: PayrollContext) {
  return [context.company.id, context.user.tenantId, context.officeId];
}

function kindParam(kind: string): EngagementKind {
  if (kind === 'employee' || kind === 'partner') return kind;
  throw new PayrollError(404, 'Payroll record type was not found');
}

async function engagements(client: DbClient, context: PayrollContext, kind: EngagementKind, id?: string) {
  const { rows } = await client.query<Engagement>(
    `SELECT e.id, e.person_id AS "personId", e.kind, e.registration, e.category_code::text AS "categoryCode",
            e.establishment_registration AS "establishmentRegistration", e.tax_allocation_code AS "taxAllocationCode",
            e.starts_on::text AS "startsOn", e.ends_on::text AS "endsOn", e.status, e.details,
            jsonb_build_object('cpf', p.cpf, 'fullName', p.full_name, 'birthDate', p.birth_date, 'details', p.details) AS person,
            coalesce(c.history, '[]') AS compensation
       FROM payroll_engagements e
       JOIN payroll_people p ON p.id = e.person_id AND p.company_id = e.company_id
         AND p.tenant_id = e.tenant_id AND p.office_id = e.office_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('id', id, 'amount', amount::text, 'unit', unit,
           'startsOn', starts_on, 'endsOn', ends_on) ORDER BY starts_on DESC) AS history
         FROM payroll_compensation c
         WHERE c.engagement_id = e.id AND c.company_id = e.company_id
           AND c.tenant_id = e.tenant_id AND c.office_id = e.office_id
       ) c ON true
      WHERE e.company_id = $1 AND e.tenant_id = $2 AND e.office_id = $3 AND e.kind = $4
        AND ($5::text IS NULL OR e.id = $5)
      ORDER BY p.full_name, e.starts_on DESC NULLS LAST, e.id`,
    [...scope(context), kind, id ?? null],
  );
  return rows;
}

export async function getEngagement(client: DbClient, context: PayrollContext, kind: EngagementKind, id: string) {
  const [result] = await engagements(client, context, kind, id);
  if (!result) throw new PayrollError(404, 'Payroll engagement was not found');
  return result;
}

async function lockEngagement(client: DbClient, context: PayrollContext, kind: EngagementKind, id: string) {
  const row = await client.query(
    'SELECT id FROM payroll_engagements WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND kind = $4 AND id = $5 FOR UPDATE',
    [...scope(context), kind, id],
  );
  if (!row.rows.length) throw new PayrollError(404, 'Payroll engagement was not found');
  return getEngagement(client, context, kind, id);
}

function issuesFor(engagement: Engagement) {
  const draft = readEngagement(engagement, engagement.kind);
  return issuesForDraft(draft, engagement.kind, engagement.compensation);
}

function issuesForDraft(draft: ReturnType<typeof readEngagement>, kind: EngagementKind, history: Compensation[]) {
  const initial = history.find(period => (
    period.startsOn <= draft.startsOn && (!period.endsOn || period.endsOn >= draft.startsOn)
  ));
  const issues = admissionIssues(draft, kind, Boolean(initial));
  if (kind === 'employee' && initial && ['task', 'variable'].includes(initial.unit) && !draft.details.variableSalaryDescription) {
    issues['details.variableSalaryDescription'] = 'Descreva como a remuneração variável ou por tarefa é calculada.';
  }
  return issues;
}

const router = Router({ mergeParams: true });
router.use('/:kind/:id/conditions', payrollConditions);

router.get('/by-cpf/:cpf', payrollAction('read', async (client, context, request) => {
  const cpf = normalizeTaxId(request.params.cpf);
  if (!isValidCpf(cpf)) throw new PayrollError(422, 'Informe um CPF válido.');
  const { rows: [person] } = await client.query<Person>(
    `SELECT cpf, full_name AS "fullName", birth_date::text AS "birthDate", details FROM payroll_people
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND cpf = $4`,
    [...scope(context), cpf],
  );
  return { person: person ?? null };
}));

router.get('/:kind', payrollAction('read', (client, context, request) =>
  engagements(client, context, kindParam(request.params.kind))));

router.get('/:kind/:id', payrollAction('read', async (client, context, request) => {
  const result = await getEngagement(client, context, kindParam(request.params.kind), request.params.id);
  return { ...result, issues: issuesFor(result) };
}));

router.post('/:kind', payrollAction('write', async (client, context, request) => {
  await lockPayrollCompany(client, context);
  const kind = kindParam(request.params.kind);
  const draft = readEngagement(request.body, kind);
  const fields = validateEngagementDraft(draft);
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise os dados do cadastro.', fields);
  const keys = scope(context);
  await client.query(
    `INSERT INTO payroll_people (company_id, tenant_id, office_id, cpf, full_name, birth_date, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (company_id, cpf) DO NOTHING`,
    [...keys, draft.person.cpf, draft.person.fullName, draft.person.birthDate || null, draft.person.details],
  );
  const { rows: [person] } = await client.query<{ id: string }>(
    'SELECT id FROM payroll_people WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND cpf = $4',
    [...keys, draft.person.cpf],
  );
  const { rows: [engagement] } = await client.query<{ id: string }>(
    `INSERT INTO payroll_engagements (company_id, tenant_id, office_id, person_id, kind, registration, category_code,
       establishment_registration, tax_allocation_code, starts_on, ends_on, details, employer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       (SELECT employer_id FROM payroll_employer_memberships WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3))
     RETURNING id`,
    [...keys, person.id, kind, draft.registration || null, draft.categoryCode || null, draft.establishmentRegistration || null,
      draft.taxAllocationCode || null, draft.startsOn || null, draft.endsOn || null, draft.details],
  );
  const result = await getEngagement(client, context, kind, engagement.id);
  return { ...result, issues: issuesFor(result) };
}, (response, result) => { response.status(201).json(result); }));

router.put('/:kind/:id', payrollAction('write', async (client, context, request) => {
  await lockPayrollCompany(client, context);
  const kind = kindParam(request.params.kind);
  const { id } = request.params;
  const current = await lockEngagement(client, context, kind, id);
  const draft = readEngagement(request.body, kind);
  const fields = validateEngagementDraft(draft);
  if (current.person.cpf !== draft.person.cpf) fields['person.cpf'] = 'O CPF identifica a pessoa vinculada a este cadastro.';
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise os dados do cadastro.', fields);

  if (current.status !== 'draft') {
    const issues = issuesForDraft(draft, kind, current.compensation);
    if (Object.keys(issues).length) throw new PayrollError(422, 'O vínculo validado exige os dados abaixo.', issues);
  }

  const keys = scope(context);
  await client.query(
    `UPDATE payroll_people SET full_name = $5, birth_date = $6, details = $7, updated_at = now()
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4`,
    [...keys, current.personId, draft.person.fullName, draft.person.birthDate || null, draft.person.details],
  );
  await client.query(
    `UPDATE payroll_engagements SET registration = $5, category_code = $6, establishment_registration = $7,
       tax_allocation_code = $8, starts_on = $9, ends_on = $10, details = $11, updated_at = now()
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4`,
    [...keys, id, draft.registration || null, draft.categoryCode || null, draft.establishmentRegistration || null,
      draft.taxAllocationCode || null, draft.startsOn || null, draft.endsOn || null, draft.details],
  );
  const result = await getEngagement(client, context, kind, id);
  return { ...result, issues: issuesFor(result) };
}));

router.post('/:kind/:id/validate', payrollAction('write', async (client, context, request) => {
  await lockPayrollCompany(client, context);
  const kind = kindParam(request.params.kind);
  const { id } = request.params;
  const current = await lockEngagement(client, context, kind, id);
  const fields = issuesFor(current);
  if (Object.keys(fields).length) throw new PayrollError(422, 'Complete os dados do vínculo.', fields);
  if (current.status === 'draft') {
    await client.query(
      "UPDATE payroll_engagements SET status = 'active', updated_at = now() WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4",
      [...scope(context), id],
    );
  }
  return { ...await getEngagement(client, context, kind, id), issues: {} };
}));

router.post('/:kind/:id/compensation', payrollAction('write', async (client, context, request) => {
  await lockPayrollCompany(client, context);
  const kind = kindParam(request.params.kind);
  const { id } = request.params;
  const current = await lockEngagement(client, context, kind, id);
  const { startsOn, amount, unit, fields } = readCompensation(request.body, kind);
  if ((current.startsOn && startsOn < current.startsOn) || (current.endsOn && startsOn > current.endsOn)) {
    fields.startsOn = 'Informe uma data durante a vigência do vínculo.';
  }
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise a remuneração.', fields);
  const match = current.compensation.find(record => record.startsOn === startsOn);
  if (match) {
    if (match.unit === unit && Number(match.amount) === Number(amount)) return { ...current, issues: issuesFor(current) };
    throw new PayrollError(409, 'Já existe um valor com a mesma data de início.');
  }

  const keys = scope(context);
  await client.query(
    `UPDATE payroll_compensation SET ends_on = $5::date - 1
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4
        AND starts_on < $5::date AND (ends_on IS NULL OR ends_on >= $5::date)`,
    [...keys, id, startsOn],
  );
  await client.query(
    `INSERT INTO payroll_compensation (company_id, tenant_id, office_id, engagement_id, starts_on, ends_on, amount, unit)
     VALUES ($1, $2, $3, $4, $5, (SELECT min(starts_on) - 1 FROM payroll_compensation
       WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4 AND starts_on > $5), $6, $7)`,
    [...keys, id, startsOn, amount, unit],
  );
  const result = await getEngagement(client, context, kind, id);
  return { ...result, issues: issuesFor(result) };
}));

export default router;
