\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role AS ENUM ('owner', 'attendant');
CREATE TYPE tenant_status AS ENUM ('pending_payment', 'active', 'expired');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');
CREATE TYPE identification_type AS ENUM ('cpf', 'cnpj');
CREATE TYPE company_status AS ENUM ('active', 'closure_pending', 'closed');
CREATE TYPE tax_regime AS ENUM ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real');

CREATE TABLE tenants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status tenant_status NOT NULL DEFAULT 'pending_payment',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_tenant_id_key UNIQUE (email, tenant_id),
  CONSTRAINT users_id_tenant_id_key UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX users_one_owner_per_tenant_idx ON users (tenant_id) WHERE role = 'owner';

CREATE TABLE invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT invitations_id_tenant_id_key UNIQUE (id, tenant_id)
);

CREATE TABLE offices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT offices_id_tenant_id_key UNIQUE (id, tenant_id)
);
CREATE INDEX offices_tenant_id_idx ON offices (tenant_id);

CREATE TABLE office_accesses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT office_accesses_user_tenant_fkey FOREIGN KEY (user_id, tenant_id)
    REFERENCES users(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT office_accesses_office_tenant_fkey FOREIGN KEY (office_id, tenant_id)
    REFERENCES offices(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT office_accesses_user_office_key UNIQUE (user_id, office_id)
);
CREATE INDEX office_accesses_tenant_user_office_idx ON office_accesses (tenant_id, user_id, office_id);

CREATE TABLE invitation_offices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  CONSTRAINT invitation_offices_invitation_tenant_fkey FOREIGN KEY (invitation_id, tenant_id)
    REFERENCES invitations(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT invitation_offices_office_tenant_fkey FOREIGN KEY (office_id, tenant_id)
    REFERENCES offices(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT invitation_offices_invitation_office_key UNIQUE (invitation_id, office_id)
);
CREATE INDEX invitation_offices_tenant_invitation_idx ON invitation_offices (tenant_id, invitation_id);

CREATE TABLE companies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  identification_type identification_type NOT NULL,
  tax_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status company_status NOT NULL DEFAULT 'active',
  requested_by_user_id TEXT,
  requested_at TIMESTAMPTZ,
  decided_by_user_id TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_office_tenant_fkey FOREIGN KEY (office_id, tenant_id)
    REFERENCES offices(id, tenant_id),
  CONSTRAINT companies_office_identification_tax_key UNIQUE (office_id, identification_type, tax_id),
  CONSTRAINT companies_id_tenant_office_key UNIQUE (id, tenant_id, office_id)
);
CREATE INDEX companies_tenant_office_status_idx ON companies (tenant_id, office_id, status);

CREATE TABLE company_tax_periods (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  tax_regime tax_regime NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_tax_periods_company_scope_fkey FOREIGN KEY (company_id, tenant_id, office_id)
    REFERENCES companies(id, tenant_id, office_id) ON DELETE CASCADE,
  CONSTRAINT company_tax_periods_valid_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX company_tax_periods_one_current_idx ON company_tax_periods (company_id) WHERE end_date IS NULL;
CREATE INDEX company_tax_periods_scope_idx ON company_tax_periods (tenant_id, office_id, company_id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY; ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY; ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY; ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY; ALTER TABLE offices FORCE ROW LEVEL SECURITY;
ALTER TABLE office_accesses ENABLE ROW LEVEL SECURITY; ALTER TABLE office_accesses FORCE ROW LEVEL SECURITY;
ALTER TABLE invitation_offices ENABLE ROW LEVEL SECURITY; ALTER TABLE invitation_offices FORCE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY; ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE company_tax_periods ENABLE ROW LEVEL SECURITY; ALTER TABLE company_tax_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON tenants FOR SELECT USING (slug IS NOT NULL OR id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_update ON tenants FOR UPDATE USING (id = current_setting('app.current_tenant', true)::TEXT) WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_delete ON tenants FOR DELETE USING (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_select ON users FOR SELECT USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_update ON users FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', true)::TEXT) WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_delete ON users FOR DELETE USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitations_select ON invitations FOR SELECT USING (true);
CREATE POLICY invitations_insert ON invitations FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitations_update ON invitations FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', true)::TEXT) WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitations_delete ON invitations FOR DELETE USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY office_accesses_select ON office_accesses FOR SELECT USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND
  (current_setting('app.current_role', true) = 'owner' OR user_id = current_setting('app.current_user', true)::TEXT)
);
CREATE POLICY office_accesses_insert ON office_accesses FOR INSERT WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner'
);
CREATE POLICY office_accesses_delete ON office_accesses FOR DELETE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner'
);

CREATE FUNCTION can_access_office(p_tenant_id TEXT, p_user_id TEXT, p_office_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $function$
  SELECT current_setting('app.current_role', true) = 'owner' OR EXISTS (
    SELECT 1 FROM office_accesses WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND office_id = p_office_id
  )
$function$;

CREATE POLICY offices_select ON offices FOR SELECT USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, id)
);
CREATE POLICY offices_insert ON offices FOR INSERT WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner'
);
CREATE POLICY offices_update ON offices FOR UPDATE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner'
) WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner');
CREATE POLICY offices_delete ON offices FOR DELETE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner'
);

CREATE POLICY invitation_offices_select ON invitation_offices FOR SELECT USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitation_offices_insert ON invitation_offices FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner');
CREATE POLICY invitation_offices_delete ON invitation_offices FOR DELETE USING (tenant_id = current_setting('app.current_tenant', true)::TEXT AND current_setting('app.current_role', true) = 'owner');

CREATE POLICY companies_select ON companies FOR SELECT USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY companies_insert ON companies FOR INSERT WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY companies_update ON companies FOR UPDATE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
) WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY companies_delete ON companies FOR DELETE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);

CREATE POLICY company_tax_periods_select ON company_tax_periods FOR SELECT USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY company_tax_periods_insert ON company_tax_periods FOR INSERT WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY company_tax_periods_update ON company_tax_periods FOR UPDATE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
) WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);
CREATE POLICY company_tax_periods_delete ON company_tax_periods FOR DELETE USING (
  tenant_id = current_setting('app.current_tenant', true)::TEXT AND office_id = current_setting('app.current_office', true)::TEXT AND
  can_access_office(tenant_id, current_setting('app.current_user', true)::TEXT, office_id)
);

CREATE FUNCTION enforce_attendant_office_access() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND tenant_id = NEW.tenant_id AND role = 'attendant') THEN
    RAISE EXCEPTION 'office access can only be assigned to attendants' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER office_accesses_attendant_only BEFORE INSERT OR UPDATE ON office_accesses
FOR EACH ROW EXECUTE FUNCTION enforce_attendant_office_access();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants, users, invitations, offices, office_accesses,
  invitation_offices, companies, company_tax_periods TO app_user;
GRANT EXECUTE ON FUNCTION can_access_office(TEXT, TEXT, TEXT), enforce_attendant_office_access() TO app_user;
GRANT USAGE, CREATE ON SCHEMA public TO migration_user;
GRANT REFERENCES ON ALL TABLES IN SCHEMA public TO migration_user;

COMMENT ON DATABASE calculosai_test IS 'Disposable local database for calculosai-saas development and tests';
