\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "Role" AS ENUM ('owner', 'attendant');
CREATE TYPE "TenantStatus" AS ENUM ('pendente_pagamento', 'ativo', 'expirado');
CREATE TYPE "ConviteStatus" AS ENUM ('pendente', 'aceito', 'expirado');

CREATE TABLE "Tenant" (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name                   TEXT NOT NULL,
  cnpj                   TEXT NOT NULL UNIQUE,
  slug                   TEXT UNIQUE,
  status                 "TenantStatus" NOT NULL DEFAULT 'pendente_pagamento',
  "stripeCustomerId"     TEXT,
  "stripeSubscriptionId" TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "User" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "tenantId"  TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  password    TEXT NOT NULL,
  role        "Role" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_tenant_fk FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id),
  CONSTRAINT user_email_tenant_unique UNIQUE (email, "tenantId")
);

CREATE TABLE "Convite" (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "tenantId"           TEXT NOT NULL,
  email                TEXT NOT NULL,
  "tokenHash"          TEXT NOT NULL UNIQUE,
  status               "ConviteStatus" NOT NULL DEFAULT 'pendente',
  "convidadoPorUserId" TEXT NOT NULL,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt"          TIMESTAMPTZ NOT NULL,
  CONSTRAINT convite_tenant_fk FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id)
);

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON "Tenant" FOR SELECT
  USING (
    slug IS NOT NULL
    OR id = current_setting('app.current_tenant', true)::TEXT
  );

CREATE POLICY tenant_insert ON "Tenant" FOR INSERT
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING (id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_delete ON "Tenant" FOR DELETE
  USING (id = current_setting('app.current_tenant', true)::TEXT);

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY user_select ON "User" FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_insert ON "User" FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_update ON "User" FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_delete ON "User" FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

ALTER TABLE "Convite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Convite" FORCE ROW LEVEL SECURITY;

CREATE POLICY convite_select ON "Convite" FOR SELECT USING (true);

CREATE POLICY convite_insert ON "Convite" FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY convite_update ON "Convite" FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY convite_delete ON "Convite" FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Tenant", "User", "Convite" TO app_user;

GRANT USAGE, CREATE ON SCHEMA public TO migration_user;
GRANT REFERENCES ON ALL TABLES IN SCHEMA public TO migration_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT REFERENCES ON TABLES TO migration_user;

COMMENT ON DATABASE calculosai_test IS
  'Banco local descartavel para desenvolvimento e testes do calculosai-saas';
