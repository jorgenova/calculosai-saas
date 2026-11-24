ALTER TABLE payroll_payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (kind IN ('regular', 'advance', 'balance', 'first_half', 'second_half'));
ALTER TABLE payroll_payments ADD COLUMN taxable_amount NUMERIC(14, 2);
ALTER TABLE payroll_payments ADD COLUMN legal_deductions NUMERIC(14, 2);
ALTER TABLE payroll_payments ADD COLUMN withheld_income_tax NUMERIC(14, 2);
ALTER TABLE payroll_payments ADD CONSTRAINT payroll_payments_tax_values_nonnegative
  CHECK (taxable_amount >= 0 AND legal_deductions >= 0 AND withheld_income_tax >= 0);

COMMENT ON COLUMN payroll_payments.kind IS 'Categoria do desembolso no demonstrativo de origem, distinguindo pagamento regular, adiantamento, saldo e apurações quinzenais.';
COMMENT ON COLUMN payroll_payments.taxable_amount IS 'Rendimento tributável alocado ao desembolso no mês de caixa, preservado para apurar a retenção dos pagamentos seguintes.';
COMMENT ON COLUMN payroll_payments.legal_deductions IS 'Deduções legais alocadas ao desembolso para acumular e conferir a apuração do imposto sobre a renda no mês do pagamento.';
COMMENT ON COLUMN payroll_payments.withheld_income_tax IS 'Imposto sobre a renda retido no desembolso, usado para compensar retenções anteriores no mesmo mês e conferir a quitação.';
