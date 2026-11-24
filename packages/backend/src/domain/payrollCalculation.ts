import {
  centsText, employeeContribution, incomeTax, maxAmount, Money, partnerContribution, publishedTaxRules,
} from './payrollTaxes';
import { Benefit, earningsAndEvents, PayrollLine, rubrics, TimeEntry, totalsFor } from './payrollRubrics';
import { vacationSettlement } from './payrollVacation';

type FiscalContext = {
  employerBasisPoints: bigint;
  partnerWithholdingBasisPoints: bigint;
  fgtsBasisPoints: bigint;
  previousEmployeeBase: Money;
  previousIndividualBase: Money;
  previousIncome: Money;
  previousPaidLegalDeductions: Money;
  previousIncomeTax: Money;
  legalDeductions: Money;
  dependents: number;
  source: string;
};

export type CalculationInput = {
  kind: 'employee' | 'partner';
  competence: string;
  paidOn: string;
  basePay: Money;
  baseSource: string;
  timeEntries: TimeEntry[];
  benefits: Benefit[];
  fiscal: FiscalContext;
  vacations?: (NonNullable<ReturnType<typeof vacationSettlement>> & { id: string })[];
  earlyPayment?: { kind: 'advance' | 'first_half'; dueOn: string; gross: Money };
  previousPayments?: { paidOn: string; taxable: Money; legalDeductions: Money; withheld: Money }[];
};

function preparePayroll(input: CalculationInput) {
  const rules = publishedTaxRules(input.competence, input.paidOn);
  const items = earningsAndEvents(input);
  let vacationContribution = 0n;
  for (const vacation of input.vacations ?? []) {
    vacationContribution += vacation.inss;
    const amounts = [
      [rubrics.vacation, vacation.base], [rubrics.vacationThird, vacation.third],
      [rubrics.vacationPaid, vacation.paid], [rubrics.vacationTax, vacation.irrf], [rubrics.vacationOther, vacation.other],
    ] as const;
    for (const [rubric, amount] of amounts) {
      if (amount > 0n) items.push({ rubric, amount, basis: amount, source: vacation.id });
    }
  }
  const { fiscal } = input;
  const bases = totalsFor(items).bases;
  const issues: string[] = [];
  let contribution = 0n;
  if (!rules.social) issues.push('A competência ainda não tem tabela previdenciária publicada no sistema.');
  if (!rules.income) issues.push('A data de pagamento ainda não tem tabela de IRRF publicada no sistema.');

  if (rules.social) {
    const result = input.kind === 'employee'
      ? employeeContribution(bases.inss, fiscal.previousEmployeeBase, fiscal.previousIndividualBase, rules.social)
      : partnerContribution(bases.inss, fiscal.previousEmployeeBase + fiscal.previousIndividualBase, fiscal.partnerWithholdingBasisPoints, rules.social);
    contribution = result.amount;
    items.push({ rubric: rubrics.inss, basis: result.taxable, amount: contribution, source: result.source });
  }
  if (input.kind === 'employee' && fiscal.fgtsBasisPoints > 0n) {
    items.push({ rubric: rubrics.fgts, basis: bases.fgts, amount: bases.fgts * fiscal.fgtsBasisPoints / 10000n,
      source: 'https://www.planalto.gov.br/ccivil_03/leis/l8036compilada.htm' });
  }
  if (fiscal.employerBasisPoints > 0n) {
    items.push({ rubric: rubrics.employer, basis: bases.inss, amount: bases.inss * fiscal.employerBasisPoints / 10000n, source: fiscal.source });
  }
  return { items, bases, issues, rules, contribution, vacationContribution };
}

type PaymentDraft = {
  kind: 'regular' | 'advance' | 'balance' | 'first_half' | 'second_half';
  dueOn: string; taxable: Money; legalDeductions: Money; netBeforeTax: Money;
};
type Payment = PaymentDraft & { withheld: Money; amount: Money };

function paymentPlan(input: CalculationInput, payroll: ReturnType<typeof preparePayroll>): PaymentDraft[] {
  const regular = { kind: 'regular' as const, dueOn: input.paidOn, taxable: payroll.bases.irrf,
    legalDeductions: maxAmount(0n, payroll.contribution - payroll.vacationContribution) + input.fiscal.legalDeductions,
    netBeforeTax: totalsFor(payroll.items).net };
  const early = input.earlyPayment;
  if (!early || early.gross === 0n) return [regular];
  if (early.gross > regular.taxable || early.gross > regular.netBeforeTax || early.dueOn >= regular.dueOn) {
    payroll.issues.push('O pagamento antecipado excede o saldo ou a sequência prevista precisa de revisão.');
    return [];
  }
  const defer = early.kind === 'advance' && early.dueOn.slice(0, 7) === input.competence.slice(0, 7)
    && regular.dueOn.slice(0, 7) === input.competence.slice(0, 7);
  return [
    { kind: early.kind, dueOn: early.dueOn, taxable: defer ? 0n : early.gross, legalDeductions: 0n, netBeforeTax: early.gross },
    { ...regular, kind: early.kind === 'advance' ? 'balance' : 'second_half',
      taxable: defer ? regular.taxable : regular.taxable - early.gross, netBeforeTax: regular.netBeforeTax - early.gross },
  ];
}

export function calculatePayrollByPerson<T extends { id: string; personId: string; input: CalculationInput }>(entries: T[]) {
  const contributions = new Map<string, { employee: Money; partner: Money }>();
  const prepared = [...entries].sort((a, b) => (
    Number(a.input.kind === 'partner') - Number(b.input.kind === 'partner') || a.id.localeCompare(b.id)
  )).map(entry => {
    const { input } = entry;
    const key = JSON.stringify([entry.personId, input.competence]);
    const previous = contributions.get(key) ?? { employee: 0n, partner: 0n };
    const payroll = preparePayroll({ ...input, fiscal: {
      ...input.fiscal,
      previousEmployeeBase: input.fiscal.previousEmployeeBase + previous.employee,
      previousIndividualBase: input.fiscal.previousIndividualBase + previous.partner,
    } });
    previous[input.kind] += payroll.bases.inss;
    contributions.set(key, previous);
    return { entry, payroll, plans: paymentPlan(input, payroll), payments: [] as Payment[] };
  });
  const ledger = new Map<string, { income: Money; legalDeductions: Money; withheld: Money }>();
  const ordered = prepared.flatMap(run => run.plans.map(plan => ({ run, plan }))).sort((a, b) => (
    a.plan.dueOn.localeCompare(b.plan.dueOn) || a.run.entry.id.localeCompare(b.run.entry.id)
  ));
  for (const { run, plan } of ordered) {
    const { entry, payroll } = run;
    const input = entry.input;
    const month = plan.dueOn.slice(0, 7);
    const key = JSON.stringify([entry.personId, month]);
    const previous = ledger.get(key) ?? { income: 0n, legalDeductions: 0n, withheld: 0n };
    const historic = (input.previousPayments ?? []).filter(payment => payment.paidOn <= plan.dueOn && payment.paidOn.startsWith(month));
    const income = previous.income + input.fiscal.previousIncome + historic.reduce((sum, row) => sum + row.taxable, 0n);
    const deductions = previous.legalDeductions + input.fiscal.previousPaidLegalDeductions
      + historic.reduce((sum, row) => sum + row.legalDeductions, 0n);
    const priorWithheld = previous.withheld + input.fiscal.previousIncomeTax + historic.reduce((sum, row) => sum + row.withheld, 0n);
    let withheld = 0n;
    const rule = publishedTaxRules(input.competence, plan.dueOn).income;
    if (!rule && !payroll.issues.includes('A data de pagamento ainda não tem tabela de IRRF publicada no sistema.')) {
      payroll.issues.push('A data de pagamento ainda não tem tabela de IRRF publicada no sistema.');
    }
    if (rule && payroll.rules.social && (plan.taxable > 0n || plan.kind !== 'advance')) {
      const result = incomeTax(income + plan.taxable, deductions + plan.legalDeductions, input.fiscal.dependents, rule);
      withheld = maxAmount(0n, result.amount - priorWithheld);
      if (result.amount < priorWithheld) payroll.issues.push('A retenção anterior supera o IRRF acumulado. Revise os pagamentos.');
      payroll.items.push({ rubric: rubrics.irrf, basis: result.taxable, amount: withheld, source: result.source });
    }
    const amount = plan.netBeforeTax - withheld;
    if (amount < 0n) payroll.issues.push('Os descontos excedem os proventos e exigem revisão.');
    run.payments.push({ ...plan, withheld, amount });
    previous.income += plan.taxable;
    previous.legalDeductions += plan.legalDeductions;
    previous.withheld += withheld;
    ledger.set(key, previous);
  }
  const results = new Map(prepared.map(({ entry, payroll, payments }) => [entry.id, {
    items: payroll.items, totals: totalsFor(payroll.items), issues: [...new Set(payroll.issues)], payments,
  }]));
  return entries.map(entry => ({ entry, result: results.get(entry.id)! }));
}

export function calculateRegularPayroll(input: CalculationInput) {
  return calculatePayrollByPerson([{ id: 'regular', personId: 'single', input }])[0].result;
}

export function serializedPayroll(result: ReturnType<typeof calculateRegularPayroll>) {
  const { totals, issues } = result;
  return {
    items: result.items.map(({ rubric, quantity, source, amount, basis }: PayrollLine) => ({
      ...rubric, quantity, source, amount: centsText(amount), basis: centsText(basis),
    })),
    totals: {
      gross: centsText(totals.gross), net: centsText(totals.net), deductions: centsText(totals.deductions),
      employerCharges: centsText(totals.employerCharges),
      bases: { inss: centsText(totals.bases.inss), irrf: centsText(totals.bases.irrf), fgts: centsText(totals.bases.fgts) },
    },
    issues,
    payments: result.payments.map(payment => ({
      kind: payment.kind, dueOn: payment.dueOn, amount: centsText(payment.amount), taxable: centsText(payment.taxable),
      legalDeductions: centsText(payment.legalDeductions), withheld: centsText(payment.withheld),
    })),
  };
}
