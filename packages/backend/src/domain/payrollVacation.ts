import { calendarDay, calendarMonth } from './payrollCalendar';
import { centsText, Money, roundRatio, toCents } from './payrollTaxes';

export type VacationPayment = {
  paidOn: string; paidAmount: string; inss: string; irrf: string; otherDeductions: string; evidenceReference: string;
};

export function vacationSettlement(
  allocations: ReturnType<typeof calculateVacation>['allocations'], payment: VacationPayment, competence: string,
) {
  const balances = {
    paid: toCents(payment.paidAmount), inss: toCents(payment.inss),
    irrf: toCents(payment.irrf), other: toCents(payment.otherDeductions),
  };
  let remainingGross = balances.paid + balances.inss + balances.irrf + balances.other;
  for (const allocation of allocations) {
    const gross = toCents(allocation.gross);
    const share = { paid: 0n, irrf: 0n, other: 0n, inss: 0n };
    let remainingShare = gross;
    let available = remainingGross;
    for (const field of ['paid', 'irrf', 'other', 'inss'] as const) {
      const value = balances[field];
      share[field] = available ? roundRatio(remainingShare, value, available) : 0n;
      available -= value;
      remainingShare -= share[field];
      balances[field] -= share[field];
    }
    if (allocation.competence === competence) return {
      ...share, base: toCents(allocation.base), third: toCents(allocation.constitutionalThird),
      paidOn: payment.paidOn, evidenceReference: payment.evidenceReference,
    };
    remainingGross -= gross;
  }
}

export function inclusiveDays(start: string, end: string) {
  return (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
}

export function calculateVacation(startsOn: string, endsOn: string, monthlyBase: Money) {
  const days = inclusiveDays(startsOn, endsOn);
  const base = roundRatio(monthlyBase, BigInt(days), 30n);
  const constitutionalThird = roundRatio(base, 1n, 3n);
  const total = base + constitutionalThird;
  let allocatedBase = 0n;
  let allocatedThird = 0n;
  const allocations = [];
  for (let start = startsOn; start <= endsOn;) {
    const competence = start.slice(0, 7);
    const finalOfMonth = calendarDay(calendarMonth(competence + '-01', 1), -1);
    const end = finalOfMonth < endsOn ? finalOfMonth : endsOn;
    const cumulativeDays = BigInt(inclusiveDays(startsOn, end));
    const cumulativeBase = roundRatio(base, cumulativeDays, BigInt(days));
    const cumulativeThird = roundRatio(constitutionalThird, cumulativeDays, BigInt(days));
    allocations.push({
      competence, days: inclusiveDays(start, end),
      base: centsText(cumulativeBase - allocatedBase),
      constitutionalThird: centsText(cumulativeThird - allocatedThird),
      gross: centsText(cumulativeBase - allocatedBase + cumulativeThird - allocatedThird),
    });
    allocatedBase = cumulativeBase;
    allocatedThird = cumulativeThird;
    start = calendarDay(end, 1);
  }
  return { days, noticeDueOn: calendarDay(startsOn, -30), paymentDueOn: calendarDay(startsOn, -2),
    base: centsText(base), constitutionalThird: centsText(constitutionalThird), gross: centsText(total), allocations };
}
