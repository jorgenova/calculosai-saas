import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { DbClient } from '../config/database';
import { asPayrollRecord, isCivilDate, payrollText } from '../domain/payrollPeople';
import { toCents } from '../domain/payrollTaxes';
import { PayrollContext, PayrollError, payrollAction } from '../middlewares/payroll';
import { lockPayrollCompany } from './payrollPolicies';

function scope(context: PayrollContext) { return [context.company.id, context.user.tenantId, context.officeId]; }
function competenceFor(month: string) {
  const date = month + '-01';
  if (!isCivilDate(date)) throw new PayrollError(422, 'Informe a competência no formato AAAA-MM.');
  return date;
}

const guideColumns = `g.id, g.kind, g.status, g.official_reference AS "officialReference", g.document_id AS "documentId",
  g.amount::text, g.expected_amount::text AS "expectedAmount", g.due_on::text AS "dueOn", g.paid_on::text AS "paidOn",
  g.payment_reference AS "paymentReference", g.discrepancy_reason AS "discrepancyReason"`;

async function findGuides(client: DbClient, context: PayrollContext, competence: string, id?: string) {
  const { rows } = await client.query(
    `SELECT ${guideColumns} FROM payroll_guides g JOIN payroll_periods p ON p.id = g.period_id
      WHERE g.company_id = $1 AND g.tenant_id = $2 AND g.office_id = $3 AND p.competence = $4
        AND ($5::text IS NULL OR g.id = $5) ORDER BY g.kind, g.id`, [...scope(context), competence, id ?? null],
  );
  return rows;
}

function guideFields(raw: unknown) {
  const body = asPayrollRecord(raw);
  const kind = payrollText(body.kind);
  const status = payrollText(body.status);
  const officialReference = payrollText(body.officialReference) || null;
  const dueOn = payrollText(body.dueOn) || null;
  const paidOn = payrollText(body.paidOn) || null;
  const paymentReference = payrollText(body.paymentReference) || null;
  const discrepancyReason = payrollText(body.discrepancyReason) || null;
  const money = (value: unknown) => payrollText(value).replace(',', '.') || null;
  const amount = money(body.amount);
  const expectedAmount = money(body.expectedAmount);
  const fields: Record<string, string> = {};
  if (!['dctfweb', 'darf', 'gfd'].includes(kind)) fields.kind = 'Selecione a obrigação.';
  const allowed = kind === 'dctfweb' ? ['pending', 'declared', 'not_applicable'] : ['pending', 'issued', 'paid', 'not_applicable'];
  if (!allowed.includes(status)) fields.status = 'Selecione uma situação válida para esta obrigação.';
  for (const [key, value] of [['amount', amount], ['expectedAmount', expectedAmount]] as const) {
    if (value && !/^\d{1,12}(\.\d{1,2})?$/.test(value)) fields[key] = 'Valor monetário inválido.';
  }
  if ((dueOn && !isCivilDate(dueOn)) || (['issued', 'paid'].includes(status) && !dueOn)) fields.dueOn = 'Informe o vencimento oficial.';
  if ((status === 'paid') !== Boolean(paidOn) || (paidOn && !isCivilDate(paidOn))) fields.paidOn = 'Informe a data de quitação quando a guia estiver paga.';
  if ((status === 'paid' && !paymentReference) || (status !== 'paid' && paymentReference) || (paymentReference?.length ?? 0) > 250) {
    fields.paymentReference = 'Informe a referência da quitação para uma guia paga.';
  }
  if ((officialReference?.length ?? 0) > 250 || (['declared', 'issued', 'paid'].includes(status) && !officialReference)) {
    fields.officialReference = 'Informe a referência oficial.';
  }
  if (['issued', 'paid'].includes(status) && amount === null) fields.amount = 'Informe o valor da guia oficial.';
  if (!fields.amount && !fields.expectedAmount && amount !== null && expectedAmount !== null
    && toCents(amount) !== toCents(expectedAmount) && !discrepancyReason) {
    fields.discrepancyReason = 'Justifique a diferença em relação ao valor de referência.';
  }
  if ((discrepancyReason?.length ?? 0) > 1000) fields.discrepancyReason = 'Use até 1.000 caracteres.';
  if (Object.keys(fields).length) throw new PayrollError(422, 'Revise os dados da obrigação.', fields);
  return { kind, status, officialReference, amount, expectedAmount, dueOn, paidOn, paymentReference, discrepancyReason };
}

const router = Router({ mergeParams: true });

router.get('/:month', payrollAction('read', async (client, context, request) => {
  const competence = competenceFor(request.params.month);
  const { rows: [delivery] } = await client.query(
    `SELECT CASE WHEN e.event_type = 'S-1298' THEN 'reopened' ELSE e.status END AS status, e.receipt
      FROM payroll_events e JOIN payroll_deliveries d ON d.id = e.delivery_id
      WHERE e.company_id = $1 AND e.tenant_id = $2 AND e.office_id = $3 AND d.competence = $4
        AND e.environment = 'production' AND (e.event_type = 'S-1299' OR (e.event_type = 'S-1298' AND e.status = 'accepted'))
      ORDER BY e.updated_at DESC, e.id DESC LIMIT 1`, [...scope(context), competence],
  );
  return { delivery: delivery ?? null, guides: await findGuides(client, context, competence) };
}));

router.post('/:month', payrollAction('write', async (client, context, request) => {
  const competence = competenceFor(request.params.month);
  const { kind, status, officialReference, amount, expectedAmount, dueOn, paidOn, paymentReference, discrepancyReason } = guideFields(request.body);
  const keys = scope(context);
  await lockPayrollCompany(client, context);
  await client.query('INSERT INTO payroll_periods (company_id, tenant_id, office_id, competence) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id, competence) DO NOTHING',
    [...keys, competence]);
  const { rows: [guide] } = await client.query<{ id: string }>(
    `INSERT INTO payroll_guides (company_id, tenant_id, office_id, period_id, kind, status, official_reference,
      amount, expected_amount, due_on, paid_on, payment_reference, discrepancy_reason)
     SELECT $1, $2, $3, p.id, $5, $6, $7, $8, $9, $10, $11, $12, $13 FROM payroll_periods p
     WHERE p.company_id = $1 AND p.tenant_id = $2 AND p.office_id = $3 AND p.competence = $4 RETURNING id`,
    [...keys, competence, kind, status, officialReference, amount, expectedAmount, dueOn, paidOn, paymentReference, discrepancyReason],
  );
  return (await findGuides(client, context, competence, guide.id))[0];
}, (response, row) => { response.status(201).json(row); }));

router.put('/:month/:id', payrollAction('write', async (client, context, request) => {
  const competence = competenceFor(request.params.month);
  await lockPayrollCompany(client, context);
  const [guide] = await findGuides(client, context, competence, request.params.id);
  if (!guide) throw new PayrollError(404, 'Obrigação não encontrada.');
  const { status, officialReference, amount, expectedAmount, dueOn, paidOn, paymentReference, discrepancyReason } =
    guideFields({ ...asPayrollRecord(request.body), kind: guide.kind });
  await client.query(
    `UPDATE payroll_guides SET status = $5, official_reference = $6, amount = $7, expected_amount = $8,
      due_on = $9, paid_on = $10, payment_reference = $11, discrepancy_reason = $12
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4`,
    [...scope(context), guide.id, status, officialReference, amount, expectedAmount, dueOn, paidOn, paymentReference, discrepancyReason],
  );
  await client.query(
    `INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id)
     VALUES ($1, $2, $3, $4, 'reconcile_payroll_guide', $5)`, [...scope(context), context.user.userId, guide.id],
  );
  return (await findGuides(client, context, competence, guide.id))[0];
}));

router.put('/:month/:id/document', express.raw({ type: 'application/pdf', limit: '5mb' }), payrollAction('write', async (client, context, request) => {
  const competence = competenceFor(request.params.month);
  const content: unknown = request.body;
  if (!Buffer.isBuffer(content) || content.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new PayrollError(422, 'Selecione um comprovante em PDF.');
  }
  await lockPayrollCompany(client, context);
  const [guide] = await findGuides(client, context, competence, request.params.id);
  if (!guide) throw new PayrollError(404, 'Obrigação não encontrada.');
  const { rows: [{ id }] } = await client.query<{ id: string }>(
    `INSERT INTO payroll_documents (company_id, tenant_id, office_id, kind, storage_key, content_type, content)
     VALUES ($1, $2, $3, 'official_guide', $4, 'application/pdf', $5) RETURNING id`,
    [...scope(context), randomUUID(), content],
  );
  await client.query('UPDATE payroll_guides SET document_id = $5 WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4',
    [...scope(context), guide.id, id]);
  return { documentId: id };
}));

export default router;
