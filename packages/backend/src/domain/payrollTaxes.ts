export type Money = bigint;

export function toCents(value: string): Money {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new RangeError('Expected a nonnegative decimal with two places at most');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function centsText(value: Money) {
  const absolute = value < 0n ? -value : value;
  return (value < 0n ? '-' : '') + (absolute / 100n).toString() + '.' + (absolute % 100n).toString().padStart(2, '0');
}

export function roundRatio(value: bigint, numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new RangeError('Expected a positive divisor');
  return (value * numerator + denominator / 2n) / denominator;
}

export function minAmount(a: bigint, b: bigint) { return a < b ? a : b; }
export function maxAmount(a: bigint, b: bigint) { return a > b ? a : b; }

type ProgressiveBand = { through: bigint | null; basisPoints: bigint; deduction?: bigint };
type SocialSecurity = { start: string; end: string; source: string; bands: ProgressiveBand[]; ceiling: bigint };
type IncomeTax = {
  start: string; end: string | null; source: string; bands: ProgressiveBand[]; dependentDeduction: bigint;
  simplifiedDeduction: bigint; reduction: { exemptionThrough: bigint; maximum: bigint; endsAt: bigint;
    constant: bigint; millionths: bigint };
};

const socialSecurity: SocialSecurity[] = [{
  start: '2026-01-01', end: '2026-12-31', ceiling: 847555n,
  source: 'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
  bands: [
    { through: 162100n, basisPoints: 750n }, { through: 290284n, basisPoints: 900n },
    { through: 435427n, basisPoints: 1200n }, { through: 847555n, basisPoints: 1400n },
  ],
}];

const incomeTaxes: IncomeTax[] = [{
  start: '2026-01-01', end: null,
  source: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
  bands: [
    { through: 242880n, basisPoints: 0n, deduction: 0n }, { through: 282665n, basisPoints: 750n, deduction: 18216n },
    { through: 375105n, basisPoints: 1500n, deduction: 39416n }, { through: 466468n, basisPoints: 2250n, deduction: 67549n },
    { through: null, basisPoints: 2750n, deduction: 90873n },
  ],
  dependentDeduction: 18959n, simplifiedDeduction: 60720n,
  reduction: { exemptionThrough: 500000n, maximum: 31289n, endsAt: 735000n, constant: 97862n, millionths: 133145n },
}];

function effective<T extends { start: string; end: string | null }>(rules: T[], date: string): T | null {
  return rules.find(rule => rule.start <= date && (rule.end === null || date <= rule.end)) ?? null;
}

export function publishedTaxRules(competence: string, paidOn: string) {
  return { social: effective(socialSecurity, competence), income: effective(incomeTaxes, paidOn) };
}

function progressiveContribution(base: Money, rule: SocialSecurity) {
  let contribution = 0n;
  let lower = 0n;
  for (const band of rule.bands) {
    const through = band.through ?? base;
    if (base <= lower) break;
    contribution += (minAmount(base, through) - lower) * band.basisPoints / 10000n;
    lower = through;
  }
  return contribution;
}

export function employeeContribution(base: Money, previousEmployeeBase: Money, previousIndividualBase: Money, rule: SocialSecurity) {
  const employeeLimit = maxAmount(0n, rule.ceiling - previousIndividualBase);
  const amount = progressiveContribution(minAmount(base + previousEmployeeBase, employeeLimit), rule)
    - progressiveContribution(minAmount(previousEmployeeBase, employeeLimit), rule);
  return { amount, taxable: minAmount(base, maxAmount(0n, employeeLimit - previousEmployeeBase)), source: rule.source };
}

export function partnerContribution(base: Money, previouslyUsedBase: Money, basisPoints: bigint, rule: SocialSecurity) {
  const taxable = minAmount(base, maxAmount(0n, rule.ceiling - previouslyUsedBase));
  return { amount: taxable * basisPoints / 10000n, taxable, source: rule.source };
}

export function incomeTax(base: Money, legalDeductions: Money, dependents: number, rule: IncomeTax) {
  if (base <= 0n) return { amount: 0n, taxable: 0n, deduction: 0n, reduction: 0n, source: rule.source };
  const deduction = maxAmount(legalDeductions + BigInt(dependents) * rule.dependentDeduction, rule.simplifiedDeduction);
  const taxable = maxAmount(0n, base - deduction);
  const band = rule.bands.find(band => band.through === null || taxable <= band.through)!;
  const calculated = maxAmount(0n, roundRatio(taxable, band.basisPoints, 10000n) - (band.deduction ?? 0n));
  let adjustment = 0n;
  if (base <= rule.reduction.exemptionThrough) adjustment = rule.reduction.maximum;
  else if (base <= rule.reduction.endsAt) {
    adjustment = maxAmount(0n, rule.reduction.constant - roundRatio(base, rule.reduction.millionths, 1000000n));
  }
  const reduction = minAmount(calculated, adjustment);
  return { amount: calculated - reduction, taxable, deduction, reduction, source: rule.source };
}
