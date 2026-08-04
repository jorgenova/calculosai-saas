-- Alinha o banco à spec aprovada docs/specs/tenant.md:
-- estado do Tenant (pendente_pagamento/ativo/expirado), vínculo com Stripe,
-- e entidade Convite (aceite de atendente com token).

CREATE TYPE "TenantStatus" AS ENUM ('pendente_pagamento', 'ativo', 'expirado');
CREATE TYPE "ConviteStatus" AS ENUM ('pendente', 'aceito', 'expirado');

ALTER TABLE "Tenant"
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'pendente_pagamento',
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT;

CREATE TABLE "Convite" (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "tenantId"           TEXT NOT NULL,
  email                TEXT NOT NULL,
  "tokenHash"          TEXT NOT NULL UNIQUE,
  status               "ConviteStatus" NOT NULL DEFAULT 'pendente',
  "convidadoPorUserId" TEXT NOT NULL,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt"          TIMESTAMPTZ NOT NULL,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id)
);

-- RLS — mesmo padrão de Tenant/User (ver docs/cerebro-do-projeto.md), com uma
-- exceção deliberada no SELECT: o endpoint público de aceite de convite ainda não
-- conhece o tenantId quando busca pelo token, então não há app.current_tenant
-- setado nesse momento. O hash do token (32 bytes de entropia) já restringe
-- qualquer SELECT a no máximo uma linha via WHERE "tokenHash" = $1 — a policy
-- permissiva não vaza outras linhas porque a aplicação nunca faz SELECT * sem
-- esse filtro. INSERT/UPDATE/DELETE continuam escopados normalmente por tenant,
-- porque sempre acontecem com app.current_tenant já setado (criação: Owner
-- autenticado; aceite: a aplicação seta o tenant assim que descobre a quem o
-- token pertence, antes de fazer o UPDATE que marca o convite como aceito).

ALTER TABLE "Convite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Convite" FORCE ROW LEVEL SECURITY;

CREATE POLICY convite_select ON "Convite" FOR SELECT
  USING (true);

CREATE POLICY convite_insert ON "Convite" FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY convite_update ON "Convite" FOR UPDATE
  USING     ("tenantId" = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY convite_delete ON "Convite" FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

-- app_user só tem DML (ver docs/cerebro-do-projeto.md — "Usuários do Banco");
-- tabela nova precisa do mesmo grant que Tenant/User já têm.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Convite" TO app_user;
