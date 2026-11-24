import { Router } from 'express';
import { DbClient } from '../config/database';
import { ConditionKind, readPayrollCondition } from '../domain/payrollConditions';
import { isCivilDate } from '../domain/payrollPeople';
import { PayrollContext, PayrollError, payrollAction } from '../middlewares/payroll';
import { lockPayrollCompany } from './payrollPolicies';

type Subject = { id: string; personId: string; kind: 'employee' | 'partner' };
type Interval = { id: string; startsOn: string; endsOn: string | null };

function scope(context: PayrollContext) {
  return [context.company.id, context.user.tenantId, context.officeId];
}

async function subject(client: DbClient, context: PayrollContext, kind: string, id: string, lock: boolean) {
  const { rows: [row] } = await client.query<Subject>(
    `SELECT id, person_id AS "personId", kind FROM payroll_engagements
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND kind = $4 AND id = $5`,
    [...scope(context), kind, id],
  );
  if (!row) throw new PayrollError(404, 'Payroll engagement was not found');
  if (lock) {
    await client.query('SELECT id FROM payroll_people WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4 FOR UPDATE',
      [...scope(context), row.personId]);
  }
  return row;
}

export async function readConditions(client: DbClient, context: PayrollContext, subject: Subject, month?: string) {
  const keys = scope(context);
  const start = month ? month + '-01' : null;
  const { rows: dependents } = await client.query(
    `SELECT id, cpf, full_name AS "fullName", birth_date::text AS "birthDate", relationship,
       relationship_description AS "relationshipDescription", income_tax AS "incomeTax", family_allowance AS "familyAllowance",
       starts_on::text AS "startsOn", ends_on::text AS "endsOn"
       FROM payroll_dependents WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND person_id = $4
        AND ($5::date IS NULL OR daterange(starts_on, ends_on, '[]') && daterange($5::date, ($5::date + interval '1 month')::date, '[)'))
      ORDER BY full_name, starts_on DESC`,
    [...keys, subject.personId, start],
  );
  const { rows: records } = await client.query(
    `SELECT i.id, i.kind, i.starts_on::text AS "startsOn", i.ends_on::text AS "endsOn", i.value
       FROM payroll_inputs i JOIN payroll_engagements e ON e.id = i.engagement_id AND e.company_id = i.company_id
        AND e.tenant_id = i.tenant_id AND e.office_id = i.office_id
      WHERE i.company_id = $1 AND i.tenant_id = $2 AND i.office_id = $3
        AND ((i.kind IN ('transport_voucher', 'meal_voucher') AND i.engagement_id = $4) OR (i.kind = 'other_source' AND e.person_id = $5))
        AND ($6::date IS NULL OR daterange(i.starts_on, i.ends_on, '[]') && daterange($6::date, ($6::date + interval '1 month')::date, '[)'))
      ORDER BY i.kind, i.starts_on DESC`,
    [...keys, subject.id, subject.personId, start],
  );
  return { dependents, records };
}

async function shortenInterval(client: DbClient, context: PayrollContext, target: 'dependent' | 'input', id: string, startsOn: string) {
  const values = [...scope(context), id, startsOn];
  if (target === 'dependent') {
    await client.query('UPDATE payroll_dependents SET ends_on = $5::date - 1 WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4', values);
  } else {
    await client.query('UPDATE payroll_inputs SET ends_on = $5::date - 1 WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4', values);
  }
}

async function closePrevious(client: DbClient, context: PayrollContext, target: 'dependent' | 'input', intervals: Interval[], startsOn: string, endsOn: string | null) {
  if (intervals.some(row => row.startsOn === startsOn)) throw new PayrollError(409, 'Já existe um registro com a mesma data de início.');
  const next = intervals.find(row => row.startsOn > startsOn);
  if (next && endsOn && endsOn >= next.startsOn) throw new PayrollError(409, 'A vigência coincide com um registro posterior.');
  const previous = intervals.find(row => row.startsOn < startsOn && (!row.endsOn || row.endsOn >= startsOn));
  if (previous) await shortenInterval(client, context, target, previous.id, startsOn);
  return next?.startsOn ?? null;
}

const router = Router({ mergeParams: true });

router.get('/', payrollAction('read', async (client, context, request) => {
  const link = await subject(client, context, request.params.kind, request.params.id, false);
  const month = request.query.month;
  if (month !== undefined && (typeof month !== 'string' || !isCivilDate(month + '-01'))) {
    throw new PayrollError(422, 'Informe a competência no formato AAAA-MM.');
  }
  return readConditions(client, context, link, month);
}));

router.post('/:condition', payrollAction('write', async (client, context, request) => {
  await lockPayrollCompany(client, context);
  const link = await subject(client, context, request.params.kind, request.params.id, true);
  const condition = request.params.condition as ConditionKind;
  if (!['dependent', 'transport_voucher', 'meal_voucher', 'other_source'].includes(condition)) {
    throw new PayrollError(404, 'Payroll condition type was not found');
  }
  if (link.kind === 'partner' && ['transport_voucher', 'meal_voucher'].includes(condition)) {
    throw new PayrollError(422, 'Este benefício exige um vínculo de emprego.');
  }
  const { startsOn, endsOn, fields, data } = readPayrollCondition(request.body, condition);
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise os dados da vigência.', fields);
  const keys = scope(context);
  if (condition === 'dependent') {
    const { rows } = await client.query<Interval>(
      `SELECT id, starts_on::text AS "startsOn", ends_on::text AS "endsOn" FROM payroll_dependents
        WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND person_id = $4
          AND (cpf = $5 OR ((cpf IS NULL OR $5::text IS NULL) AND lower(full_name) = lower($6) AND birth_date = $7::date AND relationship = $8))
        ORDER BY starts_on`,
      [...keys, link.personId, data.cpf, data.fullName, data.birthDate, data.relationship],
    );
    const nextStart = await closePrevious(client, context, 'dependent', rows, startsOn, endsOn);
    await client.query(
      `INSERT INTO payroll_dependents (company_id, tenant_id, office_id, person_id, cpf, full_name, birth_date,
        relationship, relationship_description, income_tax, family_allowance, starts_on, ends_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13::date, $14::date - 1))`,
      [...keys, link.personId, data.cpf, data.fullName, data.birthDate, data.relationship, data.relationshipDescription,
        data.incomeTax, data.familyAllowance, startsOn, endsOn, nextStart],
    );
  } else {
    const { rows } = await client.query<Interval>(
      `SELECT i.id, i.starts_on::text AS "startsOn", i.ends_on::text AS "endsOn"
         FROM payroll_inputs i JOIN payroll_engagements e ON e.id = i.engagement_id AND e.company_id = i.company_id
          AND e.tenant_id = i.tenant_id AND e.office_id = i.office_id
        WHERE i.company_id = $1 AND i.tenant_id = $2 AND i.office_id = $3 AND i.kind = $4
          AND (($4 <> 'other_source' AND i.engagement_id = $5) OR ($4 = 'other_source' AND e.person_id = $6 AND i.value->>'registration' = $7))
        ORDER BY i.starts_on`,
      [...keys, condition, link.id, link.personId, data.registration ?? null],
    );
    const nextStart = await closePrevious(client, context, 'input', rows, startsOn, endsOn);
    await client.query(
      `INSERT INTO payroll_inputs (company_id, tenant_id, office_id, engagement_id, kind, starts_on, ends_on, value)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7::date, $8::date - 1), $9)`,
      [...keys, link.id, condition, startsOn, endsOn, nextStart, data],
    );
  }
  return readConditions(client, context, link);
}, (response, result) => { response.status(201).json(result); }));

export default router;
