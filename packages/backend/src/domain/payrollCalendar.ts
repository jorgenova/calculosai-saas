import { asPayrollRecord, isCivilDate, payrollText } from './payrollPeople';

export type SalaryMode = 'monthly' | 'monthly_advance' | 'semimonthly';
type DayRule = { monthOffset: 0 | 1; kind: 'fixed' | 'business' | 'last_business'; day: number; weekdaysOnly: boolean };
type Calendar = { establishment: string; holidays: string[] };
export type PolicyRules = {
  salary: DayRule;
  partner: DayRule;
  advance: { date: DayRule; amount: string; unit: 'percentage' | 'fixed' };
  semimonthly: { cutoff: number; first: DayRule; second: DayRule };
  calendars: Calendar[];
  calculation?: {
    monthlyProration: 'calendar_days' | 'thirty_days';
    employeeEmployerRate: string;
    partnerEmployerRate: string;
    partnerWithholdingRate: string;
    reference: string;
  };
};

const nationalHolidays = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function utcDate(date: string) { return new Date(date + 'T00:00:00Z'); }

export function calendarDay(date: string, offset: number) {
  const current = utcDate(date);
  current.setUTCDate(current.getUTCDate() + offset);
  return dateOnly(current);
}

export function calendarMonth(monthStart: string, offset: number) {
  const current = utcDate(monthStart);
  current.setUTCMonth(current.getUTCMonth() + offset, 1);
  return dateOnly(current);
}

function isBusinessDay(date: string, holidays: Set<string>, weekdaysOnly: boolean) {
  const day = utcDate(date).getUTCDay();
  return day !== 0 && (!weekdaysOnly || day !== 6) && !nationalHolidays.has(date.slice(5)) && !holidays.has(date);
}

function resolveDay(monthStart: string, rule: DayRule, holidays: Set<string>) {
  const start = calendarMonth(monthStart, rule.monthOffset);
  const next = calendarMonth(start, 1);
  const last = calendarDay(next, -1);
  if (rule.kind === 'fixed') return [calendarDay(start, rule.day - 1), last].sort()[0];
  if (rule.kind === 'last_business') {
    for (let date = last; date >= start; date = calendarDay(date, -1)) {
      if (isBusinessDay(date, holidays, rule.weekdaysOnly)) return date;
    }
  } else {
    let remaining = rule.day;
    for (let date = start; date < next; date = calendarDay(date, 1)) {
      if (isBusinessDay(date, holidays, rule.weekdaysOnly) && --remaining === 0) return date;
    }
  }
  return null;
}

export function createPayrollCalendar(competence: string, mode: SalaryMode, rules: PolicyRules, establishment = '') {
  const common = rules.calendars.find(calendar => !calendar.establishment);
  const local = establishment ? rules.calendars.find(calendar => calendar.establishment === establishment) : undefined;
  const holidays = new Set([...(common?.holidays ?? []), ...(local?.holidays ?? [])]);
  const end = calendarDay(calendarMonth(competence, 1), -1);
  const deadline = resolveDay(competence, { monthOffset: 1, kind: 'business', day: 5, weekdaysOnly: false }, holidays);
  const partner = resolveDay(competence, rules.partner, holidays);
  const dates: { kind: string; startsOn: string; endsOn: string; dueOn: string | null }[] = [];
  const issues: Record<string, string> = {};
  if (!partner) issues.partner = 'O calendário de pró-labore não contém o dia útil solicitado.';
  if (mode === 'semimonthly') {
    const split = calendarDay(competence, rules.semimonthly.cutoff - 1);
    const firstDue = resolveDay(competence, rules.semimonthly.first, holidays);
    const secondDue = resolveDay(competence, rules.semimonthly.second, holidays);
    if (!firstDue || firstDue < split) issues.first = 'O vencimento da primeira quinzena deve cobrir seu período de apuração.';
    if (!secondDue || (firstDue && secondDue <= firstDue)) issues.second = 'O vencimento da segunda quinzena deve ocorrer depois do primeiro.';
    if (secondDue && deadline && secondDue > deadline) issues.second = 'O segundo vencimento excede o limite mensal geral.';
    dates.push({ kind: 'first_half', startsOn: competence, endsOn: split, dueOn: firstDue },
      { kind: 'second_half', startsOn: calendarDay(split, 1), endsOn: end, dueOn: secondDue });
  } else {
    const salary = resolveDay(competence, rules.salary, holidays);
    if (!salary || !deadline || salary > deadline) issues.salary = 'O pagamento mensal deve respeitar o quinto dia útil do mês seguinte.';
    if (mode === 'monthly_advance') {
      const advance = resolveDay(competence, rules.advance.date, holidays);
      if (!advance || advance > end || (salary && advance >= salary)) issues.advance = 'O adiantamento deve ocorrer no mês da folha e antes do saldo.';
      dates.push({ kind: 'advance', startsOn: competence, endsOn: end, dueOn: advance });
    }
    dates.push({ kind: 'salary', startsOn: competence, endsOn: end, dueOn: salary });
  }
  dates.push({ kind: 'partner', startsOn: competence, endsOn: end, dueOn: partner });
  return { competence: competence.slice(0, 7), deadline, dates, issues };
}

export function readPayrollPolicy(value: unknown) {
  const body = asPayrollRecord(value);
  const input = asPayrollRecord(body.rules);
  const fields: Record<string, string> = {};
  const mode = payrollText(body.mode) as SalaryMode;
  const startsOn = payrollText(body.startsOn);
  const agreementReference = payrollText(body.agreementReference);
  if (!isCivilDate(startsOn) || !startsOn.endsWith('-01')) fields.startsOn = 'Selecione o mês de início da vigência.';
  if (!['monthly', 'monthly_advance', 'semimonthly'].includes(mode)) fields.mode = 'Selecione a modalidade salarial.';
  if (mode === 'semimonthly' && !agreementReference) fields.agreementReference = 'Informe a referência da regra quinzenal.';

  function dayRule(value: unknown, field: string, active: boolean): DayRule {
    const input = asPayrollRecord(value);
    const { monthOffset, day, weekdaysOnly } = input;
    const kind = payrollText(input.kind) as DayRule['kind'];
    if (active && (!['fixed', 'business', 'last_business'].includes(kind) || (monthOffset !== 0 && monthOffset !== 1)
        || (kind !== 'last_business' && (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > (kind === 'fixed' ? 31 : 26))))) {
      fields[field] = 'Revise a regra de data de pagamento.';
    }
    return { kind, monthOffset: monthOffset === 1 ? 1 : 0, day: typeof day === 'number' ? day : 1, weekdaysOnly: weekdaysOnly === true };
  }

  const advance = asPayrollRecord(input.advance);
  const advanceAmount = payrollText(advance.amount).replace(',', '.');
  const advanceUnit = payrollText(advance.unit) as PolicyRules['advance']['unit'];
  if (mode === 'monthly_advance' && (!['percentage', 'fixed'].includes(advanceUnit) || !/^\d{1,12}(\.\d{1,2})?$/.test(advanceAmount)
      || Number(advanceAmount) <= 0 || (advanceUnit === 'percentage' && Number(advanceAmount) > 100))) {
    fields.advance = 'Informe o valor ou percentual do adiantamento sobre o salário-base.';
  }

  const semimonthly = asPayrollRecord(input.semimonthly);
  const cutoff = typeof semimonthly.cutoff === 'number' ? semimonthly.cutoff : 0;
  if (mode === 'semimonthly' && (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 27)) {
    fields.cutoff = 'Informe o último dia da primeira quinzena.';
  }

  const calendars: Calendar[] = [];
  if (Array.isArray(input.calendars)) {
    for (const raw of input.calendars) {
      const calendar = asPayrollRecord(raw);
      const establishment = payrollText(calendar.establishment).replace(/[.\/-]/g, '').toUpperCase();
      const holidays = Array.isArray(calendar.holidays) ? calendar.holidays.map(payrollText) : [];
      if (holidays.some(holiday => !isCivilDate(holiday)) || calendars.some(calendar => calendar.establishment === establishment)
        || (establishment && !/^(?:\d{12}|[0-9A-Z]{12}\d{2})$/.test(establishment))) {
        fields.calendars = 'Confira inscrições, feriados e calendários repetidos.';
      }
      calendars.push({ establishment, holidays: [...new Set(holidays)].sort() });
    }
  }
  const rules: PolicyRules = {
    salary: dayRule(input.salary, 'salary', mode !== 'semimonthly'),
    partner: dayRule(input.partner, 'partner', true),
    advance: { date: dayRule(advance.date, 'advanceDate', mode === 'monthly_advance'), amount: advanceAmount, unit: advanceUnit },
    semimonthly: { cutoff, first: dayRule(semimonthly.first, 'first', mode === 'semimonthly'), second: dayRule(semimonthly.second, 'second', mode === 'semimonthly') },
    calendars,
  };
  if (input.calculation !== undefined) {
    const raw = asPayrollRecord(input.calculation);
    const monthlyProration = payrollText(raw.monthlyProration);
    const employeeEmployerRate = payrollText(raw.employeeEmployerRate).replace(',', '.');
    const partnerEmployerRate = payrollText(raw.partnerEmployerRate).replace(',', '.');
    const partnerWithholdingRate = payrollText(raw.partnerWithholdingRate).replace(',', '.');
    const reference = payrollText(raw.reference);
    const rate = (value: string) => /^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100;
    if ((monthlyProration !== 'calendar_days' && monthlyProration !== 'thirty_days') || !reference ||
        ![employeeEmployerRate, partnerEmployerRate, partnerWithholdingRate].every(rate)) {
      fields.calculation = 'Informe o divisor de proporcionalidade, as alíquotas e a referência validada pelo escritório.';
    } else {
      rules.calculation = { monthlyProration, employeeEmployerRate, partnerEmployerRate, partnerWithholdingRate, reference };
    }
  }
  return { startsOn, mode, agreementReference: agreementReference || null, rules, fields };
}
