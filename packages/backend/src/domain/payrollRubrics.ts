import { centsText, maxAmount, minAmount, Money, roundRatio } from './payrollTaxes';

type Direction = 'earning' | 'deduction' | 'charge' | 'information';
type Incidence = { inss: boolean; irrf: boolean; fgts: boolean };
type Rubric = { code: string; label: string; direction: Direction; nature: string | null; incidence: Incidence };
export type PayrollLine = { rubric: Rubric; amount: Money; basis: Money; quantity?: string; source: string };

const exempt = { inss: false, irrf: false, fgts: false };
const salaryIncidence = { inss: true, irrf: true, fgts: true };
const partnerIncidence = { inss: true, irrf: true, fgts: false };
const vacationIncidence = { inss: true, irrf: false, fgts: true };

export const rubrics = {
  salary: { code: 'SALARY', label: 'Salário-base', direction: 'earning', nature: '1000', incidence: salaryIncidence },
  overtime: { code: 'OVERTIME', label: 'Hora extra', direction: 'earning', nature: '1003', incidence: salaryIncidence },
  absence: { code: 'ABSENCE', label: 'Faltas ou atrasos', direction: 'deduction', nature: '9209', incidence: salaryIncidence },
  paidLeave: { code: 'PAID_LEAVE', label: 'Ausência justificada ou afastamento remunerado', direction: 'information', nature: null, incidence: exempt },
  transport: { code: 'TRANSPORT', label: 'Desconto de vale-transporte', direction: 'deduction', nature: '9216', incidence: exempt },
  partner: { code: 'PARTNER', label: 'Pró-labore', direction: 'earning', nature: '3508', incidence: partnerIncidence },
  vacation: { code: 'VACATION', label: 'Férias gozadas', direction: 'earning', nature: '1016', incidence: vacationIncidence },
  vacationThird: { code: 'VACATION_THIRD', label: 'Terço constitucional de férias', direction: 'earning', nature: '1017', incidence: vacationIncidence },
  vacationPaid: { code: 'VACATION_PAID', label: 'Férias já pagas', direction: 'deduction', nature: '9221', incidence: exempt },
  vacationTax: { code: 'VACATION_IRRF', label: 'IRRF retido nas férias', direction: 'deduction', nature: '9203', incidence: exempt },
  vacationOther: { code: 'VACATION_OTHER', label: 'Outros descontos no recibo de férias', direction: 'deduction', nature: null, incidence: exempt },
  inss: { code: 'INSS', label: 'INSS do segurado', direction: 'deduction', nature: '9201', incidence: exempt },
  irrf: { code: 'IRRF', label: 'IRRF', direction: 'deduction', nature: '9203', incidence: exempt },
  fgts: { code: 'FGTS', label: 'FGTS do empregador', direction: 'charge', nature: null, incidence: exempt },
  employer: { code: 'EMPLOYER_SOCIAL', label: 'Contribuição do empregador', direction: 'charge', nature: null, incidence: exempt },
} satisfies Record<string, Rubric>;

export function totalsFor(lines: PayrollLine[]) {
  const totals = { gross: 0n, deductions: 0n, net: 0n, employerCharges: 0n,
    bases: { inss: 0n, irrf: 0n, fgts: 0n } };
  for (const line of lines) {
    const { direction, incidence } = line.rubric;
    if (direction === 'earning') totals.gross += line.amount;
    if (direction === 'deduction') totals.deductions += line.amount;
    if (direction === 'charge') totals.employerCharges += line.amount;
    const sign = direction === 'earning' ? 1n : direction === 'deduction' ? -1n : 0n;
    for (const base of ['inss', 'irrf', 'fgts'] as const) {
      if (incidence[base]) totals.bases[base] += sign * line.amount;
    }
  }
  totals.net = totals.gross - totals.deductions;
  for (const base of ['inss', 'irrf', 'fgts'] as const) totals.bases[base] = maxAmount(0n, totals.bases[base]);
  return totals;
}

export type TimeEntry = {
  id: string; kind: 'overtime' | 'unpaid' | 'paid';
  quantityHundredths: bigint; hourlyBase: Money; premiumBasisPoints?: bigint;
  description?: string;
};
const mealNature = { cash: '9240', card_pat: '9241', card_other: '9242', meal_pat: '9243', meal_other: '9244' };
export type Benefit = { id: string; amount: Money; discount: Money; rule: 'none' | 'fixed' | 'percentage' } & (
  { kind: 'transport' } | { kind: 'meal'; mealType: keyof typeof mealNature }
);

export function earningsAndEvents(input: {
  kind: 'employee' | 'partner'; basePay: Money; baseSource: string; timeEntries: TimeEntry[]; benefits: Benefit[];
}) {
  const lines: PayrollLine[] = [{ rubric: input.kind === 'employee' ? rubrics.salary : rubrics.partner,
    amount: input.basePay, basis: input.basePay, source: input.baseSource }];
  for (const entry of input.timeEntries) {
    if (entry.kind === 'paid') {
      lines.push({ rubric: rubrics.paidLeave, amount: 0n, basis: 0n, source: entry.id, quantity: centsText(entry.quantityHundredths) });
      continue;
    }
    const premium = entry.kind === 'overtime' ? maxAmount(5000n, entry.premiumBasisPoints ?? 5000n) : 0n;
    lines.push({ rubric: entry.kind === 'overtime' ? rubrics.overtime : rubrics.absence,
      amount: roundRatio(entry.hourlyBase, entry.quantityHundredths * (10000n + premium), 1000000n),
      basis: entry.hourlyBase, quantity: centsText(entry.quantityHundredths), source: entry.id });
  }
  for (const benefit of input.benefits) {
    if (benefit.rule === 'none') continue;
    const calculated = benefit.rule === 'fixed' ? benefit.discount : roundRatio(input.basePay, benefit.discount, 10000n);
    const limit = benefit.kind === 'transport' ? minAmount(benefit.amount, roundRatio(input.basePay, 600n, 10000n)) : benefit.amount;
    const rubric: Rubric = benefit.kind === 'transport' ? rubrics.transport : {
      code: 'MEAL_' + mealNature[benefit.mealType], label: 'Desconto de vale-refeição', direction: 'deduction',
      nature: mealNature[benefit.mealType], incidence: exempt,
    };
    lines.push({ rubric,
      basis: input.basePay, amount: minAmount(limit, calculated), source: benefit.id });
  }
  return lines;
}
