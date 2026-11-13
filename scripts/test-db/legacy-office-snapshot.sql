\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role AS ENUM ('owner', 'attendant');
CREATE TYPE tenant_status AS ENUM ('pending_payment', 'active', 'expired');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');

CREATE TABLE tenants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  status tenant_status NOT NULL DEFAULT 'pending_payment',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT users_email_tenant_id_key UNIQUE (email, tenant_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (slug IS NOT NULL OR id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_insert ON tenants FOR INSERT
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_update ON tenants FOR UPDATE
  USING (id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenants_delete ON tenants FOR DELETE
  USING (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY users_select ON users FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_update ON users FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY users_delete ON users FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY invitations_select ON invitations FOR SELECT USING (true);
CREATE POLICY invitations_insert ON invitations FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY invitations_delete ON invitations FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant', true)::TEXT);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants, users, invitations TO app_user;

INSERT INTO tenants (id, name, cnpj, slug, status) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Legacy Account A', '04252011000110', 'legacy-a', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'Legacy Account B', '11222333000181', 'legacy-b', 'active');

INSERT INTO users (id, tenant_id, name, email, password, role) VALUES
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Owner A', 'owner-a@legacy.test', 'hash', 'owner'),
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Attendant A', 'attendant-a@legacy.test', 'hash', 'attendant'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Owner B', 'owner-b@legacy.test', 'hash', 'owner');

INSERT INTO invitations (
  id, tenant_id, email, token_hash, status, invited_by_user_id, expires_at
) VALUES
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'pending@legacy.test', 'legacy-pending-token', 'pending', '11000000-0000-4000-8000-000000000001', NOW() + INTERVAL '7 days'),
  ('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'accepted@legacy.test', 'legacy-accepted-token', 'accepted', '11000000-0000-4000-8000-000000000001', NOW() + INTERVAL '7 days');
