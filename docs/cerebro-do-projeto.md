# Cerebro do Projeto — SaaS Scaffolding
> Cole este documento no inicio de uma nova sessao para continuar de onde paramos.

---

## Visao Geral

Sistema SaaS B2B multitenant para o mercado brasileiro exclusivamente.
Cada empresa cliente e um tenant com isolamento total de dados via RLS.
Este repositorio e um boilerplate generico reutilizavel para qualquer SaaS B2B.

**Repositorio:** https://github.com/jorgenova/saas_scaffolding

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite |
| Estilizacao | Tailwind CSS — minimalista B2B |
| Backend | Node.js + TypeScript + Express |
| ORM | Prisma v5 |
| Banco | PostgreSQL — Supabase |
| Auth | JWT — biblioteca jose |
| Monorepo | npm workspaces |
| Deploy | VPS Hostgator — Ubuntu 22.04 — Brasil |
| Cache / Rate Limit | Upstash Redis |
| Secrets | Doppler |
| Pagamentos | Stripe |
| E-mail | Resend |
| CI | GitHub Actions |
| Validacao CNPJ | Brasil API / Receita WS (pendente) |

---

## Infraestrutura

### Supabase
- Banco PostgreSQL gerenciado
- Regiao: Sao Paulo
- Host direto (nao usar no CI): db.igquvszgydeatjooqhrw.supabase.co:5432
- Host pooler IPv4 (usar no CI e VPS): aws-1-sa-east-1.pooler.supabase.com:5432
- Database: postgres
- IMPORTANTE: plano gratuito so tem IPv6 no host direto — sempre usar o pooler

### Formato das connection strings no pooler
- migration_user: postgresql://migration_user.igquvszgydeatjooqhrw:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
- app_user: postgresql://app_user.igquvszgydeatjooqhrw:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
- IMPORTANTE: no pooler o usuario muda de formato — adiciona .PROJECT_ID apos o nome do usuario

### VPS Hostgator
- IP: 108.174.151.132
- Porta SSH: 22022
- Usuario: deploy (sudo)
- Root via SSH: desabilitado
- Acesso root: ssh deploy + sudo su -
- Node.js v24 via nvm (instalado para o usuario deploy), npm, PM2, Nginx, Git, Doppler instalados
- Repositorio clonado em: /var/www/saas_scaffolding
- Nginx: proxy reverso porta 80 -> localhost:3000
- PM2: instalado globalmente para o usuario deploy (~/.nvm/versions/node/v24.16.0/bin/pm2)
- Doppler: configurado para o usuario deploy com scope /var/www/saas_scaffolding

### Doppler
- Projeto: saas-scaffolding
- Ambientes: dev, prd
- Secrets cadastradas: DATABASE_URL, DATABASE_URL_APP, JWT_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, RESEND_API_KEY, STRIPE_PUBLIC_KEY, STRIPE_SECRET_KEY, ALLOWED_ORIGINS
- Service Token: vps-hostgator (Read) — configurado para o usuario deploy na VPS
- Configuracao na VPS: doppler configure set token/project/config --scope /var/www/saas_scaffolding

### Upstash Redis
- Plano gratuito
- Regiao: Sao Paulo

### Stripe
- Modo teste ativo
- Produto: Plano Basico
- Price ID: price_1TYZPpRtUHllh5POkbuZXNTH

### GitHub Actions
- Pipeline: .github/workflows/ci.yml
- Trigger: push e pull_request na branch main
- Jobs: typecheck -> bypassrls -> deploy
- Deploy so roda em push direto para main
- Secrets necessarios: VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT

---

## Usuarios do Banco

| Usuario | Permissoes |
|---|---|
| postgres | Superuser — dono das tabelas, habilita RLS, cria policies |
| migration_user | USAGE + CREATE + REFERENCES no schema — apenas DDL |
| app_user | SELECT, INSERT, UPDATE, DELETE — apenas DML, sujeito ao RLS |

> IMPORTANTE: app_user tem rolbypassrls = false confirmado e verificado automaticamente no CI.
> IMPORTANTE: Para consultas de debug no Supabase usar sempre o usuario postgres — app_user e bloqueado pelo RLS sem app.current_tenant setado.

---

## Modelo de Dados

```sql
-- Enum
CREATE TYPE "Role" AS ENUM ('owner', 'attendant');

-- Tenant
CREATE TABLE "Tenant" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT NOT NULL,
  cnpj        TEXT NOT NULL UNIQUE,
  slug        TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User
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

## Prisma

- Versao: 5 (fixada — v7 tem bug com prisma.config.ts inexistente)
- Migrations em: packages/backend/prisma/migrations/
- Baseline: 0001_baseline — marca o estado inicial do banco (criado manualmente)
- Deploy: npx prisma migrate deploy (roda via migration_user no CI)
- Para novas migrations: npx prisma migrate dev --name descricao (local)
- Para verificar status: npx prisma migrate status

---

## RLS — Policies ativas

```sql
-- Tenant
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
  USING     (id = current_setting('app.current_tenant', true)::TEXT)
  WITH CHECK (id = current_setting('app.current_tenant', true)::TEXT);

CREATE POLICY tenant_delete ON "Tenant" FOR DELETE
  USING (id = current_setting('app.current_tenant', true)::TEXT);

-- User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

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

## Arquitetura de Seguranca

### Isolamento em 3 camadas
1. JWT — valida identidade e carrega tenantId. Sem token valido -> 401
2. Middleware — extrai tenantId e injeta via set_config parametrizado
3. RLS PostgreSQL — ultima linha de defesa

### Regras inegociaveis
- Algoritmo JWT fixado em HS256
- Tokens com alg: none rejeitados
- set_config sempre parametrizado — nunca interpolacao de string
- COMMIT no finish e ROLLBACK no close do request
- app_user jamais recebe BYPASSRLS
- UUID v4 em todos os IDs
- Nenhuma credencial em arquivo ou repositorio

### Rate Limiting
| Endpoint | Janela | Limite |
|---|---|---|
| POST /auth/login | 15 minutos | 10 tentativas |
| POST /onboarding | 1 hora | 5 tentativas |
| POST /cnpj/validate | 1 hora | 10 tentativas |

### CORS
- Controlado via variavel ALLOWED_ORIGINS no Doppler
- Dev: http://localhost:5173 (default quando variavel nao existe)
- Prd: dominio real separado por virgula ex: https://app.dominio.com.br

---

## Estrutura de Arquivos

```
saas_scaffolding/
├── .github/
│   └── workflows/
│       └── ci.yml
├── scripts/
│   └── check-bypassrls.js
├── packages/
│   ├── shared/
│   ├── frontend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.node.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── index.html
│   │   ├── .env
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── index.css
│   │       ├── api/
│   │       │   └── client.ts
│   │       ├── contexts/
│   │       │   └── AuthContext.tsx
│   │       ├── components/
│   │       │   └── ProtectedRoute.tsx
│   │       └── pages/
│   │           ├── Login.tsx
│   │           ├── Onboarding.tsx
│   │           ├── OwnerDashboard.tsx
│   │           └── AttendantDashboard.tsx
│   └── backend/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       │       ├── migration_lock.toml
│       │       └── 0001_baseline/
│       │           └── migration.sql
│       ├── src/
│       │   ├── config/
│       │   │   ├── database.ts
│       │   │   ├── jwt.ts
│       │   │   ├── rateLimit.ts
│       │   │   ├── email.ts
│       │   │   └── stripe.ts
│       │   ├── controllers/
│       │   │   ├── authController.ts
│       │   │   ├── onboardingController.ts
│       │   │   └── inviteController.ts
│       │   ├── middlewares/
│       │   │   ├── auth.ts
│       │   │   ├── tenant.ts
│       │   │   ├── subdomain.ts
│       │   │   └── rateLimiter.ts
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── tenant.ts
│       │   │   ├── onboarding.ts
│       │   │   └── invite.ts
│       │   └── index.ts
│       └── package.json
├── docs/
│   ├── semana-01.md
│   ├── semana-02.md
│   ├── semana-03.md
│   ├── semana-04.md
│   ├── semana-05.md
│   ├── semana-06.md
│   └── semana-07.md
└── package.json
```

---

## Roles

| Role | Descricao |
|---|---|
| owner (Proprietario) | Criado no onboarding. Acesso total. |
| attendant (Atendente) | Convidado pelo Proprietario. Acesso restrito a operacao. |

```json
{ "userId": "uuid-v4", "tenantId": "uuid-v4", "role": "owner | attendant", "exp": 1234567890 }
```

---

## Estrategia de Login

- **Principal:** slug no campo do formulario (dev e prod)
- **Producao:** subdominio extraido automaticamente do Host — slug.dominio.com.br
- O backend tenta resolver pelo subdominio primeiro, depois pelo campo slug do body (fallback)
- Redireciona para /dashboard (owner) ou /atendimento (attendant) conforme role no JWT

### Backlog semana 8
- Login alternativo por CNPJ em seudominio.com.br/entrar
- Recuperacao de subdominio por e-mail

---

## Rotas implementadas

| Metodo | Rota | Auth | Descricao |
|---|---|---|---|
| GET | /health | Nao | Health check |
| POST | /auth/login | Nao | Login via slug ou subdominio |
| POST | /onboarding | Nao | Criacao de tenant + usuario + assinatura |
| GET | /tenant/me | Sim | Dados do tenant autenticado |
| POST | /invite | Sim (owner) | Convite de atendente |

---

## Decisoes de Frontend

- SPA estatica servida pelo Nginx na VPS
- Vite como bundler — build para dist/
- Tailwind CSS — estilo minimalista B2B
- Fonte: DM Sans
- Paleta: brand (azul) + cinzas neutros
- Rotas: /entrar, /cadastro, /dashboard, /atendimento
- AuthContext gerencia token JWT no localStorage
- ProtectedRoute suporta requireOwner para rotas exclusivas do owner
- api/client.ts centraliza todas as chamadas HTTP com token automatico

## Decisoes de Backend

- CORS habilitado via pacote cors — origens controladas por ALLOWED_ORIGINS no Doppler
- subdomainMiddleware ignorado na rota /onboarding (tenant ainda nao existe)
- Slug aceito no body como fallback quando nao ha subdominio (dev local)
- Stripe apiVersion: 2026-04-22.dahlia

## Decisoes de CI — Semana 7

- Typecheck roda no GitHub Actions (ubuntu-latest, Node 24)
- BYPASSRLS verificado via SSH na VPS (contorna limitacao IPv6 do Supabase gratuito)
- Prisma migrate deploy roda na VPS via SSH antes de reiniciar o backend
- PM2 instalado para o usuario deploy via nvm
- NVM deve ser carregado explicitamente no SSH nao-interativo: export NVM_DIR + source nvm.sh
- git safe.directory necessario pois /var/www/saas_scaffolding pertence ao usuario deploy

---

## Cronograma

| Semana | Status | Descricao |
|---|---|---|
| 1 | ✅ | Repositorio, monorepo, TypeScript, banco, usuarios |
| 2 | ✅ | Prisma, tabelas, RLS, policies, permissoes |
| 3 | ✅ | VPS, Nginx, PM2, Doppler, SSH blindado |
| 4 | ✅ | Express, JWT, subdomain, tenant middleware, login, rate limiting |
| 5 | ✅ | Onboarding, Stripe, Resend, convite de atendentes |
| 6 | ✅ | Frontend — React + TypeScript + Tailwind + todas as telas |
| 7 | ✅ | CI — typecheck, bypassrls, prisma migrate, deploy automatico |
| 8 | ⏳ | Buffer + Backlog |

---

## Semana 8 — Buffer e Backlog

Atividades:
- Login alternativo por CNPJ
- Recuperacao de subdominio por e-mail
- Configurar Nginx para servir build do frontend (dist/)
- SSL na VPS
- Revisao geral
- Testes manuais do fluxo completo

---

## Decisoes em Aberto

- Validacao de CNPJ via Brasil API — ainda nao implementada
- Definir dominio final da aplicacao
- Configurar SSL na VPS
- Definir estrutura de planos alem do Plano Basico
- Configurar Nginx para servir build do frontend (dist/)

---

## Dados de Teste

### Tenant de teste 1
- ID: a10afb4a-7632-4200-bd9f-939d03f863bf
- Nome: Empresa Teste
- CNPJ: 12345678000190
- Slug: empresa-teste
- Usuario: admin@teste.com / senha123

### Tenant de teste 2
- ID: 0de33479-05c1-4f05-91e0-1246b3c440f0
- Nome: Nova Empresa
- CNPJ: 98765432000100
- Slug: nova-empresa
- Usuario owner: jorge@teste.com / senha123
- Usuario attendant: atendente@teste.com / senha123

---

## Comandos uteis

```bash
# Conectar na VPS
ssh -p 22022 deploy@108.174.151.132

# Rodar backend local
cd packages/backend && npm run dev

# Rodar frontend local
cd packages/frontend && npm run dev

# Build do frontend
cd packages/frontend && npm run build

# Typecheck todos os pacotes
npm run typecheck

# Verificar BYPASSRLS localmente
DATABASE_URL=sua_url npm run ci:bypassrls

# Verificar status das migrations
cd packages/backend && npx prisma migrate status

# Criar nova migration
cd packages/backend && npx prisma migrate dev --name descricao

# Testar health
curl http://localhost:3000/health

# Testar login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"slug":"nova-empresa","email":"jorge@teste.com","password":"senha123"}'

# Testar rota protegida
curl http://localhost:3000/tenant/me -H "Authorization: Bearer SEU-TOKEN"

# Ver secrets do Doppler na VPS
cd /var/www/saas_scaffolding && doppler secrets

# Atualizar VPS manualmente
cd /var/www/saas_scaffolding && git pull origin main && npm ci

# Gerar hash de senha para testes
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('senha123', 10).then(h => console.log(h))"

# Ver logs do PM2
pm2 logs backend

# Reiniciar backend na VPS
pm2 restart backend
```
