ALTER TABLE payroll_dependents ADD COLUMN relationship_description TEXT;

COMMENT ON COLUMN payroll_dependents.relationship_description IS 'Descrição do parentesco aplicável ao código 99 da tabela de dependentes do eSocial, preservada para validação e escrituração conforme o leiaute.';
