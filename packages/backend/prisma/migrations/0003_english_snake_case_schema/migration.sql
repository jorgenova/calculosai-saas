-- Rename persisted database identifiers to English lowercase snake_case.
ALTER TYPE "TenantStatus" RENAME TO tenant_status;
ALTER TYPE "ConviteStatus" RENAME TO invitation_status;
ALTER TYPE "Role" RENAME TO role;

ALTER TYPE tenant_status RENAME VALUE 'pendente_pagamento' TO 'pending_payment';
ALTER TYPE tenant_status RENAME VALUE 'ativo' TO 'active';
ALTER TYPE tenant_status RENAME VALUE 'expirado' TO 'expired';
ALTER TYPE invitation_status RENAME VALUE 'pendente' TO 'pending';
ALTER TYPE invitation_status RENAME VALUE 'aceito' TO 'accepted';
ALTER TYPE invitation_status RENAME VALUE 'expirado' TO 'expired';

ALTER TABLE "Tenant" RENAME TO tenants;
ALTER TABLE "User" RENAME TO users;
ALTER TABLE "Convite" RENAME TO invitations;

ALTER TABLE tenants RENAME COLUMN "stripeCustomerId" TO stripe_customer_id;
ALTER TABLE tenants RENAME COLUMN "stripeSubscriptionId" TO stripe_subscription_id;
ALTER TABLE tenants RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "tenantId" TO tenant_id;
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE invitations RENAME COLUMN "tenantId" TO tenant_id;
ALTER TABLE invitations RENAME COLUMN "tokenHash" TO token_hash;
ALTER TABLE invitations RENAME COLUMN "convidadoPorUserId" TO invited_by_user_id;
ALTER TABLE invitations RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE invitations RENAME COLUMN "expiresAt" TO expires_at;

ALTER TABLE tenants RENAME CONSTRAINT tenant_pkey TO tenants_pkey;
ALTER TABLE users RENAME CONSTRAINT user_pkey TO users_pkey;
ALTER TABLE invitations RENAME CONSTRAINT convite_pkey TO invitations_pkey;
ALTER TABLE users RENAME CONSTRAINT user_tenant_fk TO users_tenant_id_fkey;
ALTER TABLE users RENAME CONSTRAINT user_email_tenant_unique TO users_email_tenant_id_key;
ALTER TABLE invitations RENAME CONSTRAINT convite_tenant_fk TO invitations_tenant_id_fkey;

ALTER POLICY tenant_select ON tenants RENAME TO tenants_select;
ALTER POLICY tenant_insert ON tenants RENAME TO tenants_insert;
ALTER POLICY tenant_update ON tenants RENAME TO tenants_update;
ALTER POLICY tenant_delete ON tenants RENAME TO tenants_delete;
ALTER POLICY user_select ON users RENAME TO users_select;
ALTER POLICY user_insert ON users RENAME TO users_insert;
ALTER POLICY user_update ON users RENAME TO users_update;
ALTER POLICY user_delete ON users RENAME TO users_delete;
ALTER POLICY convite_select ON invitations RENAME TO invitations_select;
ALTER POLICY convite_insert ON invitations RENAME TO invitations_insert;
ALTER POLICY convite_update ON invitations RENAME TO invitations_update;
ALTER POLICY convite_delete ON invitations RENAME TO invitations_delete;
