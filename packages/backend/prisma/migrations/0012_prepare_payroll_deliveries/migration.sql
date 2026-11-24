CREATE TABLE payroll_employer_settings (
  employer_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('restricted', 'production')),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, environment),
  FOREIGN KEY (employer_id, tenant_id, office_id) REFERENCES payroll_employers(id, tenant_id, office_id)
);

ALTER TABLE payroll_employer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employer_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_employer_settings_read ON payroll_employer_settings FOR SELECT USING (
  payroll_office_in_context(tenant_id, office_id)
  AND EXISTS (SELECT 1 FROM payroll_employer_memberships m WHERE m.employer_id = payroll_employer_settings.employer_id)
);
CREATE POLICY payroll_employer_settings_manage ON payroll_employer_settings FOR ALL USING (
  payroll_office_in_context(tenant_id, office_id) AND current_setting('app.current_role', true) = 'owner'
  AND EXISTS (SELECT 1 FROM payroll_employer_memberships m WHERE m.employer_id = payroll_employer_settings.employer_id)
);
GRANT SELECT, INSERT, UPDATE ON payroll_employer_settings TO app_user;

ALTER TABLE payroll_deliveries ADD COLUMN pending_reconciliation TEXT[] NOT NULL DEFAULT '{}';
UPDATE payroll_deliveries d SET pending_reconciliation = coalesce((
  SELECT array_agg(e.id ORDER BY e.id) FROM payroll_events e WHERE e.delivery_id = d.id
    AND e.origin = 'external' AND e.status IN ('sent', 'indeterminate', 'reported', 'accepted', 'rejected')
), '{}');
COMMENT ON TABLE payroll_employer_settings IS 'Preparação do declarante e referências oficiais verificadas pelo escritório, isoladas por ambiente do eSocial.';
COMMENT ON COLUMN payroll_employer_settings.employer_id IS 'Identificador do declarante responsável pelas referências e autorizações registradas para o ambiente do eSocial escolhido.';
COMMENT ON COLUMN payroll_employer_settings.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_employer_settings.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_employer_settings.environment IS 'Ambiente oficial do eSocial ao qual se referem a autorização, os cadastros e as referências informadas pelo escritório.';
COMMENT ON COLUMN payroll_employer_settings.data IS 'Dados da preparação do declarante contendo metadados de autorização, referências de cadastro, estabelecimentos e lotações tributárias.';
COMMENT ON COLUMN payroll_employer_settings.updated_at IS 'Data e hora da última alteração das referências e da preparação, usada para acompanhar o estado dos cadastros por ambiente.';
COMMENT ON COLUMN payroll_deliveries.pending_reconciliation IS 'Identificadores internos da entrega que exigem conciliação antes de transferir a responsabilidade para o envio integrado.';
