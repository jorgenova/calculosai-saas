# Semana 2 — Prisma, Tabelas e RLS

## Contexto importante antes de começar

No Supabase, o dono das tabelas define quem pode habilitar RLS e criar policies.
Por isso a ordem correta é:

1. Criar as tabelas com o usuário `postgres` (root) via SQL
2. Habilitar RLS com o `postgres`
3. Criar policies com o `postgres`
4. Configurar o Prisma para refletir o schema existente

> ⚠️ Não usar `prisma migrate dev` no Supabase — ele cria as tabelas com o
> `migration_user` como dono, impedindo o `postgres` de habilitar RLS depois.
> Usar `prisma db pull` após criar as tabelas manualmente.

---

## 1. Instalar o Prisma no backend

```bash
cd packages/backend
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

---

## 2. Configurar o `.env`

Arquivo `packages/backend/.env` — nunca sobe pro repositório:

```env
DATABASE_URL="postgresql://migration_user:SUA-SENHA@db.SEU-HOST.supabase.co:5432/postgres"
DATABASE_URL_APP="postgresql://app_user:SUA-SENHA@db.SEU-HOST.supabase.co:5432/postgres"
```

---

## 3. Criar as tabelas com o postgres via SQL

Conecta no SQL Editor do Supabase com o usuário `postgres` e roda:

```sql
-- Apaga se existir (ambiente limpo)
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS "Tenant";
DROP TYPE IF EXISTS "Role";

-- Cria o enum de roles
CREATE TYPE "Role" AS ENUM ('owner', 'attendant');

-- Cria a tabela Tenant
CREATE TABLE "Tenant" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT NOT NULL,
  cnpj        TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cria a tabela User
CREATE TABLE "User" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "tenantId"  TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  password    TEXT NOT NULL,
  role        "Role" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id),
  UNIQUE (email, "tenantId")
);
```

---

## 4. Verificar ownership das tabelas

```sql
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public';
```

> `tableowner` deve ser `postgres` para todas as tabelas.

---

## 5. Habilitar RLS nas tabelas

```sql
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
```

---

## 6. Criar policies de isolamento por tenant

```sql
-- Policies da tabela Tenant
CREATE POLICY tenant_select ON "Tenant" FOR SELECT
  USING (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_insert ON "Tenant" FOR INSERT
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING     (id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_delete ON "Tenant" FOR DELETE
  USING (id = current_setting('app.current_tenant', true)::TEXT);

-- Policies da tabela User
CREATE POLICY user_select ON "User" FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_insert ON "User" FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_update ON "User" FOR UPDATE
  USING     ("tenantId" = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_delete ON "User" FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);
```

---

## 7. Verificar RLS ativo

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

> `rowsecurity` deve ser `true` para todas as tabelas.

---

## 8. Verificar BYPASSRLS do app_user

```sql
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname = 'app_user';
```

> `rolbypassrls` deve ser `false`.

---

## 9. Configurar permissões do migration_user

O `migration_user` precisa apenas de permissões de DDL — nunca de DML.
Roda com o `postgres`:

```sql
-- Permissão para criar novas tabelas no schema
GRANT CREATE ON SCHEMA public TO migration_user;

-- Permissão para criar foreign keys nas tabelas existentes
GRANT REFERENCES ON ALL TABLES IN SCHEMA public TO migration_user;

-- Garante que tabelas futuras também herdam a permissão de REFERENCES
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT REFERENCES ON TABLES TO migration_user;
```

Verifica as permissões do schema:

```sql
SELECT nspname, privilege_type
FROM pg_namespace
JOIN aclexplode(nspacl) ON true
WHERE nspname = 'public'
AND (aclexplode).grantee = (SELECT oid FROM pg_roles WHERE rolname = 'migration_user');
```

> Deve retornar `USAGE` e `CREATE`.

---

### Separacao de responsabilidades final

| Usuario | Permissoes |
|---|---|
| `postgres` | Dono das tabelas, habilita RLS, cria policies |
| `migration_user` | `USAGE` + `CREATE` + `REFERENCES` — apenas DDL |
| `app_user` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` — apenas DML, sujeito ao RLS |

---

## 10. Sincronizar o Prisma com o banco

Com as tabelas já criadas no banco, atualiza o `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  cnpj      String   @unique
  createdAt DateTime @default(now())

  users     User[]
}

model User {
  id        String   @id @default(uuid())
  tenantId  String
  name      String
  email     String
  password  String
  role      Role
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([email, tenantId])
}

enum Role {
  owner
  attendant
}
```

Depois sincroniza sem recriar as tabelas:

```bash
npx prisma db pull
npx prisma generate
```

---

## 11. Commit

```bash
cd ../..
git add .
git commit -m "feat: prisma setup, database schema and RLS policies"
git push origin main
```

---

## Queries uteis

```sql
-- Listar todas as policies criadas
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public';

-- Verificar ownership das tabelas
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public';

-- Verificar RLS ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

---

## Checklist Semana 2

- [x] Prisma instalado e configurado no backend
- [x] Tabelas criadas com postgres como dono via SQL
- [x] Ownership verificado
- [x] RLS habilitado com ENABLE e FORCE nas duas tabelas
- [x] Policies criadas para SELECT, INSERT, UPDATE e DELETE
- [x] app_user com rolbypassrls = false confirmado
- [x] migration_user com USAGE + CREATE + REFERENCES — sem DML
- [x] app_user com SELECT, INSERT, UPDATE, DELETE — sem DDL
- [x] Prisma sincronizado com o banco via db pull
- [x] Commit realizado
