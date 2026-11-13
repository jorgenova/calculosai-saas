const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TaxPeriod = {
  startDate: string;
  endDate: string | null;
};

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Date is invalid');
  }
  return date;
}

export function planTaxRegimeChange(
  current: TaxPeriod,
  nextStartDate: string
): { currentEndDate: string; nextStartDate: string } {
  const currentStart = parseDate(current.startDate);
  const nextStart = parseDate(nextStartDate);

  if (current.endDate !== null) {
    throw new Error('The current tax period is already closed');
  }
  if (nextStart.getTime() <= currentStart.getTime()) {
    throw new Error('The new period must start after the current period');
  }

  const previousDay = new Date(nextStart);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  return {
    currentEndDate: previousDay.toISOString().slice(0, 10),
    nextStartDate,
  };
}
