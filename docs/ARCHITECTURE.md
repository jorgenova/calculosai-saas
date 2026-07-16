# Arquitetura Técnica — SaaS Scaffolding

## Visão geral e propósito

Boilerplate para SaaS B2B multitenant voltado ao mercado brasileiro. Cada empresa cliente é um **tenant** com isolamento total de dados garantido em três camadas independentes. O objetivo é fornecer uma base de produção — auth, multitenancy, pagamentos, e-mail, CI/CD e infraestrutura — para que cada novo produto parta de um sistema funcionando, não de zero.

---

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────┐
│                        Cliente                          │
│              Browser / App / curl                       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP :80
┌──────────────────────▼──────────────────────────────────┐
│                     Traefik (VPS)                       │
│  PathPrefix("/api") → backend :3000                     │
│  PathPrefix("/")    → frontend :80                      │
└────────┬──────────────────────────────┬─────────────────┘
         │                              │
┌────────▼──────────┐       ┌───────────▼───────────────┐
│  backend (Node)   │       │  frontend (nginx + React) │
│  Express + JWT    │       │  SPA estática              │
│  pg + Prisma      │       │  Tailwind + Vite build    │
└────────┬──────────┘       └───────────────────────────┘
         │
    ┌────┴──────────────────────────────────┐
    │              Serviços externos        │
    │  Supabase (PostgreSQL + pooler)       │
    │  Upstash Redis (rate limiting)        │
    │  Stripe (assinaturas)                 │
    │  Resend (e-mail transacional)         │
    │  Brasil API (consulta CNPJ)           │
    └───────────────────────────────────────┘
```

---

## Fluxo de uma requisição ponta a ponta

### Login (`POST /api/auth/login`)

```
Browser
  │
  ▼
Traefik                    → strip /api → encaminha para backend:3000
  │
  ▼
subdomainMiddleware         → extrai slug do Host ou do body
  │                           consulta SELECT id FROM "Tenant" WHERE slug = $1
  │                           injeta req.tenantId
  ▼
loginRateLimiter            → verifica quota no Upstash Redis (10 req/15min por IP)
  │
  ▼
authController.login
  │  BEGIN
  │  SELECT set_config('app.current_tenant', tenantId, true)
  │  SELECT id, password, role FROM "User" WHERE email = $1 AND tenantId = $2
  │  COMMIT
  │  bcrypt.compare(password, hash)
  │  signToken({ userId, tenantId, role })
  ▼
{ token: "eyJ..." }        → localStorage no cliente
```

### Requisição autenticada (`GET /tenant/me`)

```
Browser  →  Authorization: Bearer <token>
  │
  ▼
authMiddleware              → jose.jwtVerify(token, JWT_SECRET)
  │                           extrai { userId, tenantId, role }
  │                           injeta req.user
  ▼
tenantMiddleware            → BEGIN
  │                           SET app.current_tenant = tenantId
  │                           res.on('finish') → COMMIT
  │                           res.on('close')  → ROLLBACK
  ▼
tenantController            → SELECT * FROM "Tenant" WHERE id = tenantId
  │                           RLS verifica: id = current_setting('app.current_tenant')
  ▼
{ id, name, slug, cnpj }
```

---

## Decisões arquiteturais

### RLS em 3 camadas

```
Camada 1 — JWT (jose/HS256)
  Algoritmo fixado em HS256. Tokens com alg:none rejeitados automaticamente.
  Sem token válido → 401 antes de qualquer acesso ao banco.

Camada 2 — Middleware (set_config parametrizado)
  O tenantId extraído do JWT é injetado como parâmetro de sessão PostgreSQL:
    SELECT set_config('app.current_tenant', $1, true)
  O $1 é sempre parametrizado — nunca interpolação de string (prevenção de SQLi).
  Escopo 'true' = válido só na transação atual.

Camada 3 — RLS no PostgreSQL (policies)
  app_user tem rolbypassrls = false.
  Toda query é filtrada automaticamente pelo banco:
    USING (id = current_setting('app.current_tenant', true)::TEXT)
  Mesmo que as camadas 1 e 2 falhem, o banco nunca expõe dados de outro tenant.
```

**Por que três camadas?** Cada uma falha de forma independente. Um bug no middleware não compromete o banco. Uma falha no banco não expõe tokens. Defense in depth.

### Split migration_user / app_user

| Usuário | Permissões | Usa SSL | Onde é usado |
|---|---|---|---|
| migration_user | USAGE + CREATE + REFERENCES | Sim | Prisma migrate (CI/CD) |
| app_user | SELECT, INSERT, UPDATE, DELETE (sujeito ao RLS) | Sim | Backend em produção |

O `migration_user` nunca roda em produção ao vivo. O `app_user` nunca faz DDL. Se o app_user for comprometido, o atacante não consegue alterar schema, criar tabelas ou escalar privilégios.

### Prisma para migrations, pg para queries

Prisma foi avaliado para queries mas descartado pelos seguintes motivos:
- O RLS depende de `set_config` executado dentro da mesma transação. O Prisma não expõe controle granular de transações com `raw SQL` mesclado com queries ORM de forma confiável.
- Queries com `pg` são explícitas: o desenvolvedor vê exatamente o SQL que será executado, o que é crítico para um sistema que depende de RLS.
- Prisma v5 tem comportamentos de pooling incompatíveis com `FORCE ROW LEVEL SECURITY` em certos cenários.

Prisma é mantido **apenas para migrations** porque o schema DSL é mais legível que SQL puro para versionamento.

### Roteamento Traefik

```
Traefik escuta :80 e usa Docker labels para descoberta automática.

/api/*  →  PathPrefix("/api"), priority 10
           middleware stripPrefix remove /api antes de encaminhar
           backend recebe /auth/login, /onboarding, etc.

/       →  PathPrefix("/"), priority 1
           frontend container (nginx) serve SPA estática
           nginx: try_files $uri /index.html (suporte a client-side routing)
```

Não há nginx no host — Traefik é o único processo escutando :80. Cada novo projeto na VPS ganha seu próprio `docker-compose.yml` com labels diferentes, e o Traefik descobre automaticamente via Docker socket.

### bypassrls no pipeline CI

```yaml
bypassrls:
  script: doppler run -- npm run ci:bypassrls
```

`scripts/check-bypassrls.js` conecta ao banco como `postgres` e verifica:
```sql
SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'
```

Se `rolbypassrls = true`, o job falha e o deploy é bloqueado. Isso previne que uma migration acidental ou alteração manual quebre o isolamento de tenant sem que ninguém perceba. O check roda via SSH na VPS porque o Supabase gratuito só tem IPv6 no host direto (o CI runner não alcança via IPv4).

---

## Módulos e responsabilidades

### packages/backend/src/

| Arquivo | Responsabilidade |
|---|---|
| `index.ts` | Bootstrap Express, CORS, registro de middlewares e rotas |
| `config/database.ts` | Pool pg conectado via `DATABASE_URL_APP` (app_user) |
| `config/jwt.ts` | `signToken` e `verifyToken` usando jose/HS256 |
| `config/rateLimit.ts` | Instâncias Upstash Ratelimit por endpoint |
| `config/email.ts` | Funções de envio via Resend |
| `config/stripe.ts` | `createCustomer` e `createSubscription` |
| `config/cnpj.ts` | `consultarCnpj` (Brasil API) e `cnpjAtivo` |
| `middlewares/auth.ts` | Verifica JWT, injeta `req.user` |
| `middlewares/tenant.ts` | Abre transação, seta `app.current_tenant`, COMMIT/ROLLBACK |
| `middlewares/subdomain.ts` | Resolve tenant pelo subdomínio ou pelo campo `slug` do body |
| `middlewares/rateLimiter.ts` | Aplica os limitadores por endpoint |
| `controllers/authController.ts` | Login: busca user no banco, compara bcrypt, emite JWT |
| `controllers/onboardingController.ts` | Cria tenant + owner + assinatura Stripe em transação |
| `controllers/inviteController.ts` | Cria convite de atendente |

### packages/frontend/src/

| Arquivo | Responsabilidade |
|---|---|
| `api/client.ts` | Fetch wrapper com token automático. BASE_URL = `/api` |
| `contexts/AuthContext.tsx` | Gerencia token JWT no localStorage, expõe `user` e `logout` |
| `components/ProtectedRoute.tsx` | Redireciona para /entrar se não autenticado; suporta `requireOwner` |
| `pages/Login.tsx` | Formulário de login com campo slug |
| `pages/Onboarding.tsx` | Cadastro de novo tenant com validação de CNPJ por dígitos verificadores |
| `pages/OwnerDashboard.tsx` | Área do proprietário |
| `pages/AttendantDashboard.tsx` | Área do atendente |

### packages/shared/

Placeholder para tipos TypeScript compartilhados entre frontend e backend. Atualmente vazio — a ser preenchido conforme o projeto cresce (ex.: tipos de resposta da API).

---

## Serviços externos

### Supabase (PostgreSQL)
- **Para que serve:** banco de dados principal com RLS habilitado
- **Onde é acionado:** todas as queries via `packages/backend/src/config/database.ts`
- **Detalhe importante:** plano gratuito só tem IPv4 via pooler (`aws-1-sa-east-1.pooler.supabase.com:5432`). Host direto é IPv6 only. Usar sempre o pooler na VPS e no CI.
- **Usuários:** `app_user` (runtime), `migration_user` (migrations CI), `postgres` (check bypassrls)

### Upstash Redis
- **Para que serve:** rate limiting stateful sem depender de memória do processo
- **Onde é acionado:** `loginRateLimiter`, `onboardingRateLimiter`, `cnpjRateLimiter` em cada request antes dos controllers
- **Limites:** login 10/15min, onboarding 5/hora, cnpj 10/hora (por IP)

### Stripe
- **Para que serve:** criação de cliente e assinatura no onboarding
- **Onde é acionado:** `onboardingController.ts` após validações e antes do INSERT no banco
- **Modo:** teste (STRIPE_SECRET_KEY começa com `sk_test_`)
- **Fluxo:** `createCustomer(email, name)` → `createSubscription(customerId, priceId)` com `payment_behavior: 'default_incomplete'`

### Resend
- **Para que serve:** e-mail de boas-vindas após onboarding concluído
- **Onde é acionado:** `onboardingController.ts` após COMMIT da transação
- **Atenção:** está fora do bloco de transação intencionalmente — falha no envio não deve reverter a criação do tenant

### Brasil API
- **Para que serve:** enriquecimento de dados no onboarding (razão social via CNPJ)
- **Onde é acionado:** frontend `Onboarding.tsx` no evento `onBlur` do campo CNPJ
- **Comportamento:** se a API retornar dados, preenche o nome da empresa automaticamente. Se falhar ou CNPJ não encontrado, deixa o usuário preencher manualmente. Não bloqueia o cadastro.

---

## Variáveis de ambiente

Todas gerenciadas pelo Doppler. Nenhuma credencial em arquivo.

### Banco de dados
| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string como `postgres` (usado no bypassrls check e migrations) |
| `DATABASE_URL_APP` | Connection string como `app_user` via pooler (runtime do backend) |

Formato pooler: `postgresql://USUARIO.PROJECT_ID:SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`

### Auth
| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Segredo HS256 — mínimo 32 bytes aleatórios |

### Redis
| Variável | Descrição |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST da instância Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Token de autenticação Upstash |

### Stripe
| Variável | Descrição |
|---|---|
| `STRIPE_SECRET_KEY` | Chave secreta (`sk_test_...` ou `sk_live_...`) |
| `STRIPE_PUBLIC_KEY` | Chave pública (`pk_test_...` ou `pk_live_...`) |

### E-mail
| Variável | Descrição |
|---|---|
| `RESEND_API_KEY` | Chave da API Resend |

### CORS
| Variável | Descrição |
|---|---|
| `ALLOWED_ORIGINS` | Origens permitidas separadas por vírgula. Ex: `https://app.dominio.com.br` |

### Configuração Doppler na VPS
```bash
doppler configure set token <SERVICE_TOKEN> --scope /var/www/saas_scaffolding
doppler configure set project saas-scaffolding --scope /var/www/saas_scaffolding
doppler configure set config prd --scope /var/www/saas_scaffolding
```

---

## Como rodar localmente

### Pré-requisitos
- Node.js 24+
- npm 10+
- Acesso ao Supabase (ou PostgreSQL local com RLS configurado)
- Conta Doppler (ou `.env` manual)

### Setup

```bash
# Clonar e instalar
git clone https://github.com/jorgenova/saas_scaffolding
cd saas_scaffolding
npm ci

# Configurar variáveis (opção A: Doppler)
doppler setup

# Configurar variáveis (opção B: .env manual em packages/backend/)
# DATABASE_URL=...
# DATABASE_URL_APP=...
# JWT_SECRET=...
# etc.

# Rodar migrations
cd packages/backend
doppler run -- npx prisma migrate deploy

# Backend (porta 3000)
npm run dev:backend

# Frontend (porta 5173 com proxy /api → localhost:3000)
npm run dev:frontend
```

O Vite está configurado com proxy: toda chamada a `/api/*` é redirecionada para `localhost:3000` com strip do prefixo. O frontend acessa `http://localhost:5173`.

### Schema do banco

O schema é definido em `packages/backend/prisma/schema.prisma`. A migration `0001_baseline` marca o estado inicial (criado manualmente no Supabase). Para criar o schema do zero em um banco novo:

```sql
-- Executar como postgres no SQL Editor do Supabase

CREATE TYPE "Role" AS ENUM ('owner', 'attendant');

CREATE TABLE "Tenant" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT NOT NULL,
  cnpj        TEXT NOT NULL UNIQUE,
  slug        TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "User" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant"(id),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  password    TEXT NOT NULL,
  role        "Role" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, "tenantId")
);

-- Usuários da aplicação
CREATE ROLE migration_user WITH LOGIN PASSWORD 'SENHA';
CREATE ROLE app_user WITH LOGIN PASSWORD 'SENHA';

GRANT USAGE ON SCHEMA public TO migration_user, app_user;
GRANT CREATE ON SCHEMA public TO migration_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- RLS
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "User"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"   FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON "Tenant" FOR SELECT
  USING (slug IS NOT NULL OR id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenant_insert ON "Tenant" FOR INSERT
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING (id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY tenant_delete ON "Tenant" FOR DELETE
  USING (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY user_select ON "User" FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY user_insert ON "User" FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY user_update ON "User" FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::TEXT);
CREATE POLICY user_delete ON "User" FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true)::TEXT);
```

---

## Deploy

### Pipeline CI/CD (GitHub Actions)

```
push para main
  │
  ├── typecheck          → npm run typecheck (todos os workspaces)
  │
  ├── bypassrls          → SSH na VPS → doppler run -- npm run ci:bypassrls
  │                        (verifica app_user.rolbypassrls = false)
  │
  └── deploy (só em push direto para main)
        SSH na VPS:
        git pull origin main
        npm ci
        cd packages/backend → doppler run -- npx prisma migrate deploy
        doppler run -- docker compose up -d --build
```

### Infraestrutura da VPS

```
/opt/traefik/
  docker-compose.yml    ← Traefik compartilhado entre todos os projetos

/var/www/saas_scaffolding/
  docker-compose.yml    ← backend + frontend deste projeto
  packages/
    backend/Dockerfile
    frontend/Dockerfile
    frontend/nginx.conf
```

Secrets injetados pelo Doppler no momento do `docker compose up`:
```bash
doppler run -- docker compose up -d --build
```

---

## Estrutura do monorepo

```
saas_scaffolding/
├── package.json              ← workspaces: packages/*
│                                scripts: dev:backend, dev:frontend, typecheck, ci:bypassrls
├── docker-compose.yml        ← stack de produção (backend + frontend + labels Traefik)
├── .dockerignore
├── .github/
│   └── workflows/ci.yml      ← typecheck → bypassrls → deploy
├── scripts/
│   └── check-bypassrls.js    ← verifica rolbypassrls do app_user
├── packages/
│   ├── shared/               ← placeholder para tipos compartilhados
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/0001_baseline/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config/       ← database, jwt, rateLimit, email, stripe, cnpj
│   │       ├── controllers/  ← auth, onboarding, invite
│   │       ├── middlewares/  ← auth, tenant, subdomain, rateLimiter
│   │       └── routes/       ← auth, onboarding, tenant, invite
│   └── frontend/
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── package.json
│       ├── vite.config.ts    ← proxy /api → localhost:3000 (dev)
│       ├── tailwind.config.js
│       └── src/
│           ├── api/client.ts
│           ├── contexts/AuthContext.tsx
│           ├── components/ProtectedRoute.tsx
│           └── pages/        ← Login, Onboarding, OwnerDashboard, AttendantDashboard
└── docs/
    ├── ARCHITECTURE.md       ← este documento
    └── semana-01..07.md      ← diário de desenvolvimento
```
