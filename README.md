# SaaS Scaffolding

Boilerplate de produção para SaaS B2B multitenant voltado ao mercado brasileiro. Parte de um sistema funcionando — auth, multitenancy com RLS, pagamentos, e-mail, CI/CD e infraestrutura Docker já configurados.

## O que está pronto

| Área | O que já funciona |
|---|---|
| **Auth** | Login por slug/subdomínio, JWT HS256, token no localStorage |
| **Multitenancy** | RLS em 3 camadas: JWT → middleware → policies PostgreSQL |
| **Onboarding** | Cadastro de tenant com validação de CNPJ + consulta opcional à Receita Federal |
| **Convites** | Owner convida atendentes por e-mail |
| **Pagamentos** | Stripe: cliente + assinatura criados no cadastro |
| **E-mail** | Boas-vindas via Resend |
| **Rate limiting** | Upstash Redis por endpoint |
| **Infraestrutura** | Docker + Traefik na VPS — cada projeto isolado em containers |
| **CI/CD** | GitHub Actions: typecheck → verificação RLS → deploy automático |
| **Secrets** | Doppler — zero credencial em arquivo |

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript + Prisma (migrations) + pg (queries)
- **Banco:** PostgreSQL no Supabase com RLS
- **Infra:** VPS + Docker + Traefik
- **Serviços:** Stripe, Resend, Upstash Redis, Brasil API

---

## Criar um novo SaaS a partir deste template

### 1. Criar repositório

No GitHub, clique em **"Use this template"** → **"Create a new repository"**.

Clone localmente:
```bash
git clone https://github.com/SEU_USUARIO/MEU-PROJETO
cd MEU-PROJETO
npm ci
```

### 2. Inicializar o projeto

```bash
node scripts/create-saas.js
```

O script pergunta: slug, nome de exibição, domínio e projeto Doppler.
Ao final gera `SETUP-CHECKLIST.md` com todos os passos personalizados — incluindo um `JWT_SECRET` gerado automaticamente.

### 3. Seguir o checklist

Abra `SETUP-CHECKLIST.md` e execute cada etapa:
- Criar projeto no Supabase e configurar schema + usuários + RLS
- Criar projeto no Doppler e cadastrar todos os secrets
- Criar produto no Stripe e atualizar o Price ID no frontend
- Configurar a VPS e fazer o primeiro deploy

**Guia completo:** [`docs/TEMPLATE-GUIDE.md`](docs/TEMPLATE-GUIDE.md)
**Arquitetura detalhada:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Rodar localmente

```bash
# Banco PostgreSQL local isolado (porta 5433)
npm run test:db:start
npm run test:db:verify

# Backend (porta 3000)
npm run dev:backend:test

# Frontend (porta 5173 — proxy /api → localhost:3000 já configurado)
npm run dev:frontend
```

O banco de testes usa PostgreSQL 16, fica em `.test-data/` e reproduz as roles,
grants e policies RLS documentadas para produção. As credenciais são apenas
locais e estão em `packages/backend/.env.test` (ignorado pelo Git); o arquivo
`.env.test.example` serve como modelo.

Nesse ambiente, `EXTERNAL_SERVICES_MODE=mock` evita chamadas reais ao Upstash,
Stripe e Resend. Rate limits são ignorados, IDs de cliente/assinatura são
simulados e os e-mails aparecem no console do backend. O modo padrão continua
sendo `live`, portanto produção só usa mocks se a variável for definida
explicitamente.

Por segurança, o backend recusa o modo mock fora de `NODE_ENV=test` ou
`development` e também quando `DATABASE_URL_APP` não aponta para `localhost`.
Tokens de convite ficam ocultos nos logs por padrão; para testes manuais locais,
use `MOCK_EXPOSE_INVITE_TOKEN=true` apenas no `.env.test` ignorado pelo Git.

Comandos de manutenção:

```bash
npm run test:db:status  # mostra se o servidor está ativo
npm run test:db:reset   # recria somente o banco descartável calculosai_test
npm run test:db:stop    # encerra o PostgreSQL local
```

> O histórico atual de migrations não reconstrói o schema do zero:
> `0001_baseline` é vazio e `0002` pressupõe tabelas existentes. Por isso o
> ambiente local usa `scripts/test-db/bootstrap.sql`, derivado do schema e das
> policies canônicas em `docs/cerebro-do-projeto.md`.

Variáveis necessárias no backend (via Doppler ou `.env`):
`DATABASE_URL`, `DATABASE_URL_APP`, `JWT_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`

## Comandos úteis

```bash
npm run typecheck                                  # TypeScript em todos os pacotes
npm run ci:bypassrls                               # Verifica segurança RLS do app_user
cd packages/backend && npx prisma migrate deploy   # Rodar migrations
doppler run -- docker compose up -d --build        # Deploy em produção
```

---

## Estrutura

```
packages/
  backend/   Node.js + Express — auth, onboarding, tenant, invite
  frontend/  React + Vite — login, cadastro, dashboard owner/atendente
  shared/    Tipos TypeScript compartilhados (placeholder)
scripts/
  check-bypassrls.js   Verificação de segurança RLS no CI
  create-saas.js       Script de inicialização de novo projeto
docs/
  ARCHITECTURE.md      Documentação técnica completa
  TEMPLATE-GUIDE.md    Core vs. opcional, provisioning, passo a passo
```
