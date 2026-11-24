-- Add optional, stable Company registration data and a separately scoped address relation.
ALTER TABLE companies
  ADD COLUMN legal_name TEXT,
  ADD COLUMN trade_name TEXT,
  ADD COLUMN is_headquarters BOOLEAN,
  ADD COLUMN activity_started_at DATE,
  ADD COLUMN legal_nature TEXT,
  ADD COLUMN municipal_registration TEXT,
  ADD COLUMN state_registration TEXT,
  ADD COLUMN suframa_registration TEXT,
  ADD COLUMN cei TEXT,
  ADD COLUMN caepf TEXT,
  ADD COLUMN primary_cnae_code TEXT,
  ADD COLUMN preparation_cnae_code TEXT,
  ADD COLUMN activity_description TEXT,
  ADD COLUMN share_capital NUMERIC(18, 2),
  ADD COLUMN annual_revenue NUMERIC(18, 2),
  ADD COLUMN is_small_business BOOLEAN;

CREATE TABLE company_addresses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  postal_code TEXT,
  street_type TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  district TEXT,
  city_code TEXT,
  city TEXT,
  state TEXT,
  federal_code TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_addresses_company_scope_fkey
    FOREIGN KEY (company_id, tenant_id, office_id)
    REFERENCES companies(id, tenant_id, office_id) ON DELETE CASCADE
);
CREATE INDEX company_addresses_scope_idx ON company_addresses (tenant_id, office_id, company_id);
CREATE UNIQUE INDEX company_addresses_one_primary_idx
  ON company_addresses (company_id) WHERE is_primary;

ALTER TABLE company_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY company_addresses_select ON company_addresses FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant', true)::TEXT
    AND office_id = current_setting('app.current_office', true)::TEXT
    AND can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
  );
CREATE POLICY company_addresses_insert ON company_addresses FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::TEXT
    AND office_id = current_setting('app.current_office', true)::TEXT
    AND can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
  );
CREATE POLICY company_addresses_update ON company_addresses FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant', true)::TEXT
    AND office_id = current_setting('app.current_office', true)::TEXT
    AND can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::TEXT
    AND office_id = current_setting('app.current_office', true)::TEXT
    AND can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
  );
CREATE POLICY company_addresses_delete ON company_addresses FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant', true)::TEXT
    AND office_id = current_setting('app.current_office', true)::TEXT
    AND can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON company_addresses TO app_user;

COMMENT ON TABLE company_addresses IS 'Armazena endereços de empresas atendidas, mantendo escopo de Tenant e Office para permitir múltiplos endereços futuros sem perder isolamento.';
COMMENT ON COLUMN companies.legal_name IS 'Razão social opcional da empresa, mantida separada do nome mínimo já usado para identificação e busca.';
COMMENT ON COLUMN companies.trade_name IS 'Nome fantasia opcional usado para representação comercial da empresa.';
COMMENT ON COLUMN companies.is_headquarters IS 'Indica se a empresa é matriz quando a informação foi declarada; nulo representa dado não informado.';
COMMENT ON COLUMN companies.activity_started_at IS 'Data civil opcional de início das atividades econômicas da empresa.';
COMMENT ON COLUMN companies.legal_nature IS 'Natureza jurídica opcional informada no cadastro empresarial.';
COMMENT ON COLUMN companies.municipal_registration IS 'Inscrição municipal opcional preservada como texto para manter zeros e formatação oficial.';
COMMENT ON COLUMN companies.state_registration IS 'Inscrição estadual opcional preservada como texto para manter zeros e formatação oficial.';
COMMENT ON COLUMN companies.suframa_registration IS 'Inscrição SUFRAMA opcional da empresa quando aplicável.';
COMMENT ON COLUMN companies.cei IS 'Cadastro Específico do INSS opcional, preservado como texto.';
COMMENT ON COLUMN companies.caepf IS 'Cadastro de Atividade Econômica da Pessoa Física opcional, preservado como texto.';
COMMENT ON COLUMN companies.primary_cnae_code IS 'Código CNAE principal opcional, mantido como texto para preservar representação oficial.';
COMMENT ON COLUMN companies.preparation_cnae_code IS 'Código CNAE preparatório opcional, mantido como texto para preservar representação oficial.';
COMMENT ON COLUMN companies.activity_description IS 'Descrição textual opcional da atividade econômica declarada pela empresa.';
COMMENT ON COLUMN companies.share_capital IS 'Capital social cadastral opcional com precisão monetária de dezoito dígitos e duas casas decimais.';
COMMENT ON COLUMN companies.annual_revenue IS 'Faturamento anual cadastral opcional com precisão monetária de dezoito dígitos e duas casas decimais.';
COMMENT ON COLUMN companies.is_small_business IS 'Indica pequeno porte quando declarado; nulo representa dado não informado.';
COMMENT ON COLUMN company_addresses.id IS 'Identificador técnico único do endereço da empresa.';
COMMENT ON COLUMN company_addresses.tenant_id IS 'Conta contratante que delimita o isolamento do endereço.';
COMMENT ON COLUMN company_addresses.office_id IS 'Escritório responsável pela empresa e pelo endereço.';
COMMENT ON COLUMN company_addresses.company_id IS 'Empresa atendida à qual o endereço pertence dentro do mesmo Tenant e Office.';
COMMENT ON COLUMN company_addresses.postal_code IS 'CEP opcional do endereço, preservado como texto para manter zeros à esquerda.';
COMMENT ON COLUMN company_addresses.street_type IS 'Tipo de logradouro opcional, como Rua, Avenida ou Rodovia.';
COMMENT ON COLUMN company_addresses.street IS 'Nome opcional do logradouro.';
COMMENT ON COLUMN company_addresses.number IS 'Número opcional do endereço, mantido como texto para acomodar formatos especiais.';
COMMENT ON COLUMN company_addresses.complement IS 'Complemento opcional do endereço.';
COMMENT ON COLUMN company_addresses.neighborhood IS 'Bairro opcional do endereço.';
COMMENT ON COLUMN company_addresses.district IS 'Distrito opcional do endereço.';
COMMENT ON COLUMN company_addresses.city_code IS 'Código municipal opcional, preservado como texto.';
COMMENT ON COLUMN company_addresses.city IS 'Nome opcional do município.';
COMMENT ON COLUMN company_addresses.state IS 'Sigla ou nome opcional da unidade federativa.';
COMMENT ON COLUMN company_addresses.federal_code IS 'Código federal opcional associado à localidade.';
COMMENT ON COLUMN company_addresses.is_primary IS 'Indica o endereço principal da empresa; no máximo um endereço principal é permitido por empresa.';
COMMENT ON COLUMN company_addresses.created_at IS 'Data e hora com fuso em que o endereço foi criado.';
COMMENT ON COLUMN company_addresses.updated_at IS 'Data e hora com fuso da última alteração persistida no endereço.';
