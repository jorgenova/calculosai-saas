import { Router } from 'express';
import { DbClient } from '../config/database';
import { calendarDay, createPayrollCalendar, PolicyRules, readPayrollPolicy, SalaryMode } from '../domain/payrollCalendar';
import { isCivilDate } from '../domain/payrollPeople';
import { PayrollContext, PayrollError, payrollAction } from '../middlewares/payroll';
import { AuthRequest } from '../middlewares/auth';

export type Policy = { id: string; mode: SalaryMode; startsOn: string; endsOn: string | null; agreementReference: string | null; rules: PolicyRules };

function scope(context: PayrollContext) { return [context.company.id, context.user.tenantId, context.officeId]; }

export async function readPolicies(client: DbClient, context: PayrollContext, month: string | null = null): Promise<Policy[]> {
  const { rows } = await client.query<Policy>(
    `SELECT id, salary_mode AS mode, starts_on::text AS "startsOn", ends_on::text AS "endsOn",
      agreement_reference AS "agreementReference", rules FROM payroll_policies
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
        AND ($4::date IS NULL OR ($4 >= starts_on AND (ends_on IS NULL OR $4 <= ends_on)))
      ORDER BY starts_on DESC`,
    [...scope(context), month],
  );
  return rows;
}

export async function lockPayrollCompany(client: DbClient, context: PayrollContext) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(['payroll-company', ...scope(context)])]);
}

const router = Router({ mergeParams: true });

router.get('/', payrollAction('read', (client, context) => readPolicies(client, context)));

router.get('/calendar/:month', payrollAction('read', async (client, context, request) => {
  const start = request.params.month + '-01';
  if (!isCivilDate(start)) throw new PayrollError(422, 'Informe a competência no formato AAAA-MM.');
  const [policy] = await readPolicies(client, context, start);
  if (!policy) throw new PayrollError(404, 'A competência ainda não tem política de pagamento.');
  const establishment = typeof request.query.establishment === 'string' ? request.query.establishment.replace(/[.\/-]/g, '').toUpperCase() : '';
  return { policyId: policy.id, ...createPayrollCalendar(start, policy.mode, policy.rules, establishment) };
}));

async function savePolicy(client: DbClient, context: PayrollContext, request: AuthRequest) {
  const { startsOn, mode, agreementReference, rules, fields } = readPayrollPolicy(request.body);
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise os dados da política.', fields);
  const establishments = new Set(['', ...rules.calendars.map(calendar => calendar.establishment)]);
  for (const establishment of establishments) {
    const { issues } = createPayrollCalendar(startsOn, mode, rules, establishment);
    if (Object.keys(issues).length) throw new PayrollError(422, 'Revise os vencimentos para a primeira competência da vigência.', issues);
  }

  await lockPayrollCompany(client, context);
  const keys = scope(context);
  const policies = await readPolicies(client, context);
  const revision = request.params.policyId ? policies.find(policy => policy.id === request.params.policyId) : undefined;
  if (request.params.policyId && !revision) throw new PayrollError(404, 'Política de pagamento não encontrada.');
  if (revision && revision.startsOn !== startsOn) throw new PayrollError(422, 'Cadastre uma nova vigência para alterar a competência de início.');
  if (!revision && policies.some(policy => policy.startsOn === startsOn)) throw new PayrollError(409, 'Já existe uma política com início nessa competência.');
  const upcoming = policies.filter(policy => policy.startsOn > startsOn).at(-1);
  const endsOn = upcoming ? calendarDay(upcoming.startsOn, -1) : null;
  const affected = await client.query(
    `SELECT p.competence::text FROM payroll_periods p JOIN payroll_versions v ON v.period_id = p.id
      WHERE p.company_id = $1 AND p.tenant_id = $2 AND p.office_id = $3 AND p.competence >= $4
        AND ($5::date IS NULL OR p.competence <= $5)
        AND (v.approved_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM payroll_statements s JOIN payroll_payments payment ON payment.statement_id = s.id
          WHERE s.version_id = v.id AND payment.paid_on IS NOT NULL
        )) LIMIT 1`,
    [...keys, startsOn, endsOn],
  );
  if (affected.rows.length) throw new PayrollError(409, 'A vigência afeta uma competência fechada ou com pagamento registrado. Escolha uma competência futura ou revise a folha afetada.');

  if (revision) {
    const { rows: [policy] } = await client.query<Policy>(
      `UPDATE payroll_policies SET salary_mode = $5, agreement_reference = $6, rules = $7
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4
        RETURNING id, salary_mode AS mode, starts_on::text AS "startsOn", ends_on::text AS "endsOn",
          agreement_reference AS "agreementReference", rules`,
      [...keys, revision.id, mode, agreementReference, rules],
    );
    return policy;
  }

  await client.query(
    `UPDATE payroll_policies SET ends_on = $4::date - 1
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND starts_on < $4
        AND (ends_on IS NULL OR ends_on >= $4)`,
    [...keys, startsOn],
  );
  const { rows: [policy] } = await client.query<Policy>(
    `INSERT INTO payroll_policies (company_id, tenant_id, office_id, salary_mode, starts_on, ends_on, agreement_reference, rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, salary_mode AS mode, starts_on::text AS "startsOn",
       ends_on::text AS "endsOn", agreement_reference AS "agreementReference", rules`,
    [...keys, mode, startsOn, endsOn, agreementReference, rules],
  );
  return policy;
}

router.post('/', payrollAction('write', savePolicy, (response, policy) => { response.status(201).json(policy); }));
router.put('/:policyId', payrollAction('write', savePolicy));

export default router;
