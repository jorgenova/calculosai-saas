import { Router } from 'express';
import { DbClient } from '../config/database';
import { payrollDate, payrollDocument, payrollMoney } from '../domain/payrollDocuments';
import { asPayrollRecord, isCivilDate, payrollText } from '../domain/payrollPeople';
import { toCents } from '../domain/payrollTaxes';
import { calculateVacation, inclusiveDays, VacationPayment } from '../domain/payrollVacation';
import { PayrollContext, PayrollError, payrollAction, sendPayrollDocument } from '../middlewares/payroll';
import { lockPayrollCompany } from './payrollPolicies';

function scope(context: PayrollContext) { return [context.company.id, context.user.tenantId, context.officeId]; }

type VacationValue = ReturnType<typeof calculateVacation> & { acquisitionStartsOn: string; acquisitionEndsOn: string;
  entitlementDays: number; monthlyBase: string; additionalBase: string; compensationId: string;
  companyName?: string; workerName?: string; payment?: VacationPayment };

export async function readVacations(client: DbClient, context: PayrollContext, filter?: { start?: string; end?: string; id?: string }) {
  const { rows } = await client.query<{ id: string; personId: string; fullName: string; startsOn: string; endsOn: string;
    engagementId: string; value: VacationValue }>(
    `SELECT i.id, i.engagement_id AS "engagementId", i.starts_on::text AS "startsOn", i.ends_on::text AS "endsOn",
        e.person_id AS "personId", p.full_name AS "fullName", i.value
       FROM payroll_inputs i
       JOIN payroll_engagements e ON e.id = i.engagement_id AND e.company_id = i.company_id AND e.tenant_id = i.tenant_id AND e.office_id = i.office_id
       JOIN payroll_people p ON p.id = e.person_id AND p.company_id = e.company_id AND p.tenant_id = e.tenant_id AND p.office_id = e.office_id
      WHERE i.company_id = $1 AND i.tenant_id = $2 AND i.office_id = $3 AND i.kind = 'vacation'
        AND ($4::date IS NULL OR (i.starts_on <= $5::date AND i.ends_on >= $4::date))
        AND ($6::text IS NULL OR i.id = $6)
      ORDER BY i.starts_on, i.id`, [...scope(context), filter?.start ?? null, filter?.end ?? null, filter?.id ?? null],
  );
  return rows;
}

const router = Router({ mergeParams: true });
router.get('/', payrollAction('read', (client, context) => readVacations(client, context)));

router.post('/', payrollAction('write', async (client, context, request) => {
  const body = asPayrollRecord(request.body);
  const engagementId = payrollText(body.engagementId);
  const startsOn = payrollText(body.startsOn);
  const endsOn = payrollText(body.endsOn);
  const acquisitionStartsOn = payrollText(body.acquisitionStartsOn);
  const acquisitionEndsOn = payrollText(body.acquisitionEndsOn);
  const entitlementDays = Number(body.entitlementDays);
  const additionalBase = (payrollText(body.additionalBase) || '0').replace(',', '.');
  if (!engagementId || ![startsOn, endsOn, acquisitionStartsOn, acquisitionEndsOn].every(isCivilDate)
    || acquisitionStartsOn > acquisitionEndsOn || acquisitionEndsOn >= startsOn || startsOn > endsOn
    || ![12, 18, 24, 30].includes(entitlementDays) || !/^\d{1,12}(\.\d{1,2})?$/.test(additionalBase)) {
    throw new PayrollError(422, 'Confira o vínculo, as datas, o direito a férias e a base complementar.');
  }
  const days = inclusiveDays(startsOn, endsOn);
  if (days < 5 || days > entitlementDays) throw new PayrollError(422, 'Confira a quantidade de dias do período de gozo.');

  await lockPayrollCompany(client, context);
  const keys = scope(context);
  const { rows: [link] } = await client.query<{ full_name: string }>(
    `SELECT p.full_name FROM payroll_engagements e JOIN payroll_people p ON e.person_id = p.id
      AND e.company_id = p.company_id AND e.tenant_id = p.tenant_id AND e.office_id = p.office_id
      WHERE e.company_id = $1 AND e.tenant_id = $2 AND e.office_id = $3 AND e.id = $4 AND e.kind = 'employee'
        AND e.status IN ('active','ended') AND e.starts_on <= $5::date AND (e.ends_on IS NULL OR e.ends_on >= $6::date)`,
    [...keys, engagementId, acquisitionStartsOn, endsOn],
  );
  if (!link) throw new PayrollError(404, 'Vínculo de emprego elegível não encontrado.');
  const { rowCount: protectedPeriods } = await client.query(
    `SELECT 1 FROM payroll_periods p JOIN payroll_versions v ON v.period_id = p.id
      WHERE p.company_id = $1 AND p.tenant_id = $2 AND p.office_id = $3
        AND p.competence BETWEEN date_trunc('month', $4::date::timestamp)::date AND date_trunc('month', $5::date::timestamp)::date
        AND (v.approved_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM payroll_statements s JOIN payroll_payments payment ON payment.statement_id = s.id
          WHERE s.version_id = v.id AND s.engagement_id = $6 AND payment.paid_on IS NOT NULL
        )) LIMIT 1`,
    [...keys, startsOn, endsOn, engagementId],
  );
  if (protectedPeriods) throw new PayrollError(409, 'O período afeta uma competência fechada ou com pagamento registrado.');
  const { rows: [salary] } = await client.query<{ id: string; amount: string }>(
    `SELECT id, amount::text FROM payroll_compensation
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4 AND unit = 'month'
        AND starts_on <= $5::date AND (ends_on IS NULL OR ends_on >= $5::date)`, [...keys, engagementId, startsOn],
  );
  if (!salary) throw new PayrollError(422, 'Informe uma remuneração mensal vigente no início do gozo.');

  const { rows: scheduled } = await client.query<{ startsOn: string; endsOn: string; value: VacationValue }>(
    `SELECT starts_on::text AS "startsOn", ends_on::text AS "endsOn", value
      FROM payroll_inputs WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND engagement_id = $4 AND kind = 'vacation'`,
    [...keys, engagementId],
  );
  if (scheduled.some(row => row.startsOn <= endsOn && row.endsOn >= startsOn)) {
    throw new PayrollError(409, 'O período de gozo coincide com férias já registradas.');
  }
  const acquisition = scheduled.filter(row => row.value.acquisitionStartsOn <= acquisitionEndsOn
    && row.value.acquisitionEndsOn >= acquisitionStartsOn);
  if (acquisition.some(row => row.value.acquisitionStartsOn !== acquisitionStartsOn
    || row.value.acquisitionEndsOn !== acquisitionEndsOn || row.value.entitlementDays !== entitlementDays)) {
    throw new PayrollError(409, 'Confira a vigência e os dias de direito do período aquisitivo já registrado.');
  }
  const slices = [...acquisition.map(row => row.value.days), days];
  const remainder = entitlementDays - slices.reduce((total, slice) => total + slice, 0);
  if (slices.length > 3 || remainder < 0 || (remainder > 0 && (slices.length === 3 || remainder < 5))
    || ((slices.length > 1 || remainder > 0) && Math.max(...slices, remainder) < 14)) {
    throw new PayrollError(422, 'Confira o saldo e o fracionamento das férias deste período aquisitivo.');
  }

  const value: VacationValue = { ...calculateVacation(startsOn, endsOn, toCents(salary.amount) + toCents(additionalBase)),
    acquisitionStartsOn, acquisitionEndsOn, entitlementDays, monthlyBase: salary.amount, additionalBase, compensationId: salary.id,
    companyName: context.company.name, workerName: link.full_name };
  const { rows: [saved] } = await client.query(
    `INSERT INTO payroll_inputs (company_id, tenant_id, office_id, engagement_id, kind, starts_on, ends_on, value)
      VALUES ($1, $2, $3, $4, 'vacation', $5, $6, $7) RETURNING id`,
    [...keys, engagementId, startsOn, endsOn, value],
  );
  return { id: saved.id, ...value };
}, (response, data) => { response.status(201).json(data); }));

router.put('/:id/payment', payrollAction('write', async (client, context, request) => {
  const input = asPayrollRecord(request.body);
  const paidOn = payrollText(input.paidOn);
  const evidenceReference = payrollText(input.evidenceReference);
  const money = (value: unknown) => payrollText(value).replace(',', '.');
  const paidAmount = money(input.paidAmount);
  const inss = money(input.inss);
  const irrf = money(input.irrf);
  const otherDeductions = money(input.otherDeductions);
  if (!isCivilDate(paidOn) || !evidenceReference || evidenceReference.length > 250
    || ![paidAmount, inss, irrf, otherDeductions].every(amount => /^\d{1,12}(\.\d{1,2})?$/.test(amount))) {
    throw new PayrollError(422, 'Informe a data, o valor e os descontos do pagamento conferido.');
  }
  await lockPayrollCompany(client, context);
  const [vacation] = await readVacations(client, context, { id: request.params.id });
  if (!vacation) throw new PayrollError(404, 'Programação de férias não encontrada.');
  const payment: VacationPayment = {
    paidOn, paidAmount, inss, irrf, otherDeductions, evidenceReference,
  };
  const existing = vacation.value.payment;
  if (existing) {
    const same = existing.paidOn === paidOn && existing.evidenceReference === evidenceReference
      && (['paidAmount', 'inss', 'irrf', 'otherDeductions'] as const).every(key => toCents(existing[key]) === toCents(payment[key]));
    if (same) return existing;
    throw new PayrollError(409, 'O pagamento de férias já tem confirmação registrada.');
  }
  if (toCents(paidAmount) + toCents(inss) + toCents(irrf) + toCents(otherDeductions) !== toCents(vacation.value.gross)) {
    throw new PayrollError(422, 'O valor pago e os descontos devem totalizar o bruto das férias.');
  }
  await client.query(
    `UPDATE payroll_inputs SET value = value || jsonb_build_object('payment', $5::jsonb)
      WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND id = $4 AND kind = 'vacation'`,
    [...scope(context), vacation.id, payment],
  );
  await client.query(
    `INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id)
     VALUES ($1, $2, $3, $4, 'record_vacation_payment', $5)`, [...scope(context), context.user.userId, vacation.id],
  );
  return payment;
}));

router.get('/:id/documents/:kind', payrollAction('read', async (client, context, request) => {
  const [vacation] = await readVacations(client, context, { id: request.params.id });
  const kind = request.params.kind;
  if (!vacation || !['notice', 'receipt'].includes(kind)) throw new PayrollError(404, 'Documento de férias não encontrado.');
  const { value } = vacation;
  const receipt = kind === 'receipt';
  if (receipt && !value.payment) throw new PayrollError(404, 'Confirme o pagamento para emitir o recibo de férias.');
  const rows: [string, string][] = [
    ['Funcionário', value.workerName ?? vacation.fullName],
    ['Período aquisitivo', payrollDate(value.acquisitionStartsOn) + ' a ' + payrollDate(value.acquisitionEndsOn)],
    ['Período de gozo', payrollDate(vacation.startsOn) + ' a ' + payrollDate(vacation.endsOn)],
    ['Dias de gozo', String(value.days)],
    ['Data limite do aviso', payrollDate(value.noticeDueOn)],
    ['Data limite do pagamento', payrollDate(value.paymentDueOn)],
  ];
  if (receipt && value.payment) rows.push(
    ['Bruto', payrollMoney(value.gross)], ['Terço constitucional', payrollMoney(value.constitutionalThird)],
    ['INSS conferido', payrollMoney(value.payment.inss)], ['IRRF conferido', payrollMoney(value.payment.irrf)],
    ['Outros descontos', payrollMoney(value.payment.otherDeductions)], ['Valor recebido', payrollMoney(value.payment.paidAmount)],
    ['Data do pagamento', payrollDate(value.payment.paidOn)], ['Referência do pagamento', value.payment.evidenceReference],
  );
  return { filename: `ferias-${receipt ? 'recibo' : 'aviso'}-${vacation.startsOn}.html`,
    html: payrollDocument(receipt ? 'Recibo de férias' : 'Aviso de férias', value.companyName ?? context.company.name, [{ rows }]) };
}, sendPayrollDocument));

export default router;
