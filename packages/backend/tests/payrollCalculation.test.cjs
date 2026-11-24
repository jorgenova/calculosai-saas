const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculatePayrollByPerson, calculateRegularPayroll, serializedPayroll } = require('../dist/domain/payrollCalculation');
const { incomeTax, publishedTaxRules } = require('../dist/domain/payrollTaxes');
const { calculateVacation } = require('../dist/domain/payrollVacation');

test('2026 IRRF matches Receita Federal examples for monthly reduction', () => {
  const rules = publishedTaxRules('2026-01-01', '2026-01-02');
  assert.equal(incomeTax(500000n, 0n, 0, rules.income).amount, 0n);
  const regular = incomeTax(600000n, 64960n, 0, rules.income);
  assert.equal(regular.taxable, 535040n);
  assert.equal(regular.reduction, 17975n);
  assert.equal(regular.amount, 38288n);
  assert.equal(publishedTaxRules('2027-01-01', '2027-02-04').social, null);
});

const fiscal = {
  employerBasisPoints: 0n, partnerWithholdingBasisPoints: 1100n, fgtsBasisPoints: 800n,
  previousEmployeeBase: 0n, previousIndividualBase: 0n, previousIncome: 0n, previousPaidLegalDeductions: 0n,
  previousIncomeTax: 0n, legalDeductions: 0n, dependents: 0, source: 'Test configuration',
};

test('employee earnings, absences, benefits and FGTS reconcile without deducting employer charges', () => {
  const result = serializedPayroll(calculateRegularPayroll({
    kind: 'employee', competence: '2026-11-01', paidOn: '2026-12-05', basePay: 300000n, baseSource: 'salary-v1', fiscal,
    timeEntries: [
      { id: 'ot-1', kind: 'overtime', quantityHundredths: 1000n, hourlyBase: 1364n, premiumBasisPoints: 5000n },
      { id: 'absence-1', kind: 'unpaid', quantityHundredths: 200n, hourlyBase: 1364n },
      { id: 'leave-1', kind: 'paid', quantityHundredths: 800n, hourlyBase: 1364n },
    ],
    benefits: [
      { id: 'vt', kind: 'transport', amount: 12000n, discount: 600n, rule: 'percentage' },
      { id: 'vr', kind: 'meal', mealType: 'card_other', amount: 40000n, discount: 4000n, rule: 'fixed' },
    ],
  }));
  assert.deepEqual(result.issues, []);
  assert.equal(result.totals.gross, '3204.60');
  assert.equal(result.totals.bases.inss, '3177.32');
  assert.equal(result.items.find(item => item.code === 'INSS').amount, '269.86');
  assert.equal(result.items.find(item => item.code === 'FGTS').amount, '254.18');
  assert.equal(result.items.find(item => item.code.startsWith('MEAL_')).nature, '9242');
  assert.equal(result.totals.net, '2747.46');
});

test('partner contribution applies the remaining ceiling for another source', () => {
  const result = serializedPayroll(calculateRegularPayroll({
    kind: 'partner', competence: '2026-11-01', paidOn: '2026-11-30', basePay: 300000n, baseSource: 'partner-v1',
    fiscal: { ...fiscal, fgtsBasisPoints: 0n, previousEmployeeBase: 750000n }, timeEntries: [], benefits: [],
  }));
  const social = result.items.find(item => item.code === 'INSS');
  assert.equal(social.basis, '975.55');
  assert.equal(social.amount, '107.31');
  assert.equal(result.totals.net, '2892.69');
  assert.equal(result.totals.employerCharges, '0.00');
});

test('salary-only, partner-only and combined payroll keep a single contribution ceiling', () => {
  const employee = { id: 'employee', personId: 'same-cpf', input: {
    kind: 'employee', competence: '2026-11-01', paidOn: '2026-11-27', basePay: 700000n, baseSource: 'salary',
    timeEntries: [], benefits: [], fiscal: { ...fiscal, previousEmployeeBase: 50000n },
  } };
  const partner = { id: 'partner', personId: 'same-cpf', input: {
    ...employee.input, kind: 'partner', paidOn: '2026-11-24', basePay: 200000n, baseSource: 'partner',
  } };
  const line = (result, code) => result.items.find(item => item.rubric.code === code);
  const [{ result: employeeOnly }] = calculatePayrollByPerson([employee]);
  const [{ result: partnerOnly }] = calculatePayrollByPerson([partner]);
  assert.equal(line(employeeOnly, 'INSS').basis, 700000n);
  assert.equal(line(partnerOnly, 'INSS').amount, 22000n);
  assert.equal(line(partnerOnly, 'FGTS'), undefined);

  const [{ result: combinedPartner }, { result: combinedEmployee }] = calculatePayrollByPerson([partner, employee]);
  assert.equal(line(combinedPartner, 'INSS').basis, 97555n);
  assert.equal(line(combinedPartner, 'INSS').amount, 10731n);
  assert.equal(line(combinedPartner, 'IRRF').amount, 0n);
  const expected = incomeTax(900000n, line(combinedEmployee, 'INSS').amount + 10731n, 0,
    publishedTaxRules('2026-11-01', '2026-11-27').income);
  assert.equal(line(combinedEmployee, 'IRRF').amount, expected.amount);
  assert.equal(line(combinedEmployee, 'FGTS').amount, 56000n);

  const laterEmployee = { ...employee, input: { ...employee.input, paidOn: '2026-12-05' } };
  const [, { result: nextMonth }] = calculatePayrollByPerson([partner, laterEmployee]);
  assert.equal(line(nextMonth, 'IRRF').amount, line(employeeOnly, 'IRRF').amount);
  const separatePartner = { ...partner, personId: 'different-cpf' };
  const [{ result: independent }] = calculatePayrollByPerson([separatePartner, employee]);
  assert.equal(line(independent, 'INSS').amount, 22000n);
});

test('vacation preview allocates the same gross and constitutional third across two competencies', () => {
  const vacation = calculateVacation('2026-11-23', '2026-12-07', 300000n);
  assert.equal(vacation.days, 15);
  assert.equal(vacation.noticeDueOn, '2026-10-24');
  assert.equal(vacation.paymentDueOn, '2026-11-21');
  assert.equal(vacation.base, '1500.00');
  assert.equal(vacation.constitutionalThird, '500.00');
  assert.deepEqual(vacation.allocations.map(row => [row.competence, row.days, row.gross]), [
    ['2026-11', 8, '1066.67'], ['2026-12', 7, '933.33'],
  ]);
});

test('ordinary payments in the same month withhold only the difference from earlier IRRF', () => {
  const first = { id: 'salary', personId: 'same-cpf', input: {
    kind: 'employee', competence: '2026-11-01', paidOn: '2026-11-05', basePay: 600000n,
    baseSource: 'salary', fiscal, timeEntries: [], benefits: [],
  } };
  const second = { id: 'partner', personId: first.personId, input: {
    ...first.input, kind: 'partner', paidOn: '2026-11-26', baseSource: 'partner',
  } };
  const results = calculatePayrollByPerson([second, first]).map(({ result }) => result);
  const previousTax = results[1].items.find(item => item.rubric.code === 'IRRF').amount;
  const laterTax = results[0].items.find(item => item.rubric.code === 'IRRF').amount;
  const legalDeductions = results.reduce((sum, result) => sum + result.items.find(item => item.rubric.code === 'INSS').amount, 0n);
  assert.ok(previousTax > 0n);
  assert.equal(previousTax + laterTax,
    incomeTax(1200000n, legalDeductions, 0, publishedTaxRules('2026-11-01', '2026-11-26').income).amount);
});

test('salary advance and balance distinguish the same month from separate payment months', () => {
  const input = { kind: 'employee', competence: '2026-11-01', paidOn: '2026-11-30',
    basePay: 1000000n, baseSource: 'monthly', fiscal, timeEntries: [], benefits: [],
    earlyPayment: { kind: 'advance', dueOn: '2026-11-15', gross: 600000n },
  };
  const sameMonth = calculateRegularPayroll(input);
  const acrossMonths = calculateRegularPayroll({ ...input, paidOn: '2026-12-05' });
  assert.equal(sameMonth.payments[0].withheld, 0n);
  assert.ok(sameMonth.payments[1].withheld > 0n);
  assert.equal(acrossMonths.payments[0].withheld, 39454n);
  assert.equal(acrossMonths.payments[1].withheld, 0n);
  for (const result of [sameMonth, acrossMonths]) {
    assert.deepEqual(result.issues, []);
    assert.equal(result.payments.reduce((sum, row) => sum + row.amount, 0n), result.totals.net);
  }
});

test('quinzenal allocations consume the monthly gross once and carry previous actual receipts', () => {
  const input = { kind: 'employee', competence: '2026-11-01', paidOn: '2026-12-05',
    basePay: 600000n, baseSource: 'quinzenas', fiscal, timeEntries: [], benefits: [],
    earlyPayment: { kind: 'first_half', dueOn: '2026-11-15', gross: 300000n },
  };
  const result = calculateRegularPayroll(input);
  assert.deepEqual(result.payments.map(row => row.kind), ['first_half', 'second_half']);
  assert.equal(result.payments.reduce((sum, row) => sum + row.taxable, 0n), 600000n);
  assert.equal(result.payments.reduce((sum, row) => sum + row.amount, 0n), result.totals.net);
  const withHistory = calculateRegularPayroll({ ...input, previousPayments: [
    { paidOn: '2026-11-02', taxable: 280000n, legalDeductions: 0n, withheld: 0n },
  ] });
  assert.equal(result.payments[0].withheld, 0n);
  assert.ok(withHistory.payments[0].withheld > 0n);
});
