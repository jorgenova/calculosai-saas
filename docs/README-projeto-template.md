# {{DISPLAY_NAME}}

> README gerado pelo template saas-scaffolding.
> Substitua os campos {{...}} e remova esta linha antes de publicar.

SaaS B2B multitenant para o mercado brasileiro.

## Pré-requisitos

- Node.js 24+
- npm 10+
- Docker + Docker Compose
- Conta Doppler (secrets)
- Projeto Supabase criado e configurado

## Variáveis de ambiente

Todas as variáveis são gerenciadas pelo Doppler. Configure localmente:

```bash
doppler setup
```

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL como postgres (migrations e CI) |
| `DATABASE_URL_APP` | PostgreSQL como app_user via pooler (runtime) |
| `JWT_SECRET` | Segredo HS256 — gerado no init |
| `UPSTASH_REDIS_REST_URL` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `RESEND_API_KEY` | E-mail transacional |
| `STRIPE_SECRET_KEY` | Pagamentos |
| `STRIPE_PUBLIC_KEY` | Pagamentos |
| `ALLOWED_ORIGINS` | Origens CORS permitidas |

## Instalação local

```bash
npm ci

# Backend (porta 3000)
npm run dev:backend

# Frontend (porta 5173)
npm run dev:frontend
```

O frontend em dev usa proxy Vite: chamadas a `/api/*` são redirecionadas automaticamente para `localhost:3000`.

## Migrations

```bash
cd packages/backend
doppler run -- npx prisma migrate deploy   # aplicar migrations pendentes
npx prisma migrate dev --name descricao    # criar nova migration (local)
npx prisma migrate status                  # verificar estado
```

## Rodar em produção (VPS)

```bash
# Na VPS, dentro do diretório do projeto
git pull origin main
doppler run -- npx prisma migrate deploy
doppler run -- docker compose up -d --build
```

## CI/CD

Push para `main` dispara automaticamente:
1. **Typecheck** — valida TypeScript em todos os pacotes
2. **bypassrls** — verifica que `app_user.rolbypassrls = false` (segurança RLS)
3. **Deploy** — git pull + migrations + docker compose up na VPS

Secrets necessários no GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`

## Arquitetura de segurança

Isolamento de tenant em 3 camadas:

1. **JWT (HS256)** — toda requisição autenticada carrega `tenantId` assinado
2. **Middleware** — injeta `app.current_tenant` na sessão PostgreSQL via `set_config` parametrizado
3. **RLS PostgreSQL** — `app_user` tem `rolbypassrls = false`; o banco filtra automaticamente

Nenhuma query retorna dados de outro tenant mesmo que as camadas 1 e 2 falhem.

## Estrutura do projeto

```
packages/
  backend/
    src/
      config/       database, jwt, rateLimit, email, stripe, cnpj
      controllers/  auth, onboarding, invite
      middlewares/  auth, tenant, subdomain, rateLimiter
      routes/       auth, onboarding, tenant, invite
    prisma/
      schema.prisma
      migrations/
  frontend/
    src/
      api/          client.ts (fetch wrapper com token automático)
      contexts/     AuthContext.tsx
      components/   ProtectedRoute.tsx
      pages/        Login, Onboarding, OwnerDashboard, AttendantDashboard
  shared/           tipos TypeScript compartilhados
```

## Comandos úteis

```bash
npm run typecheck          # TypeScript em todos os pacotes
npm run ci:bypassrls       # Verificação manual de segurança RLS
docker compose logs -f     # Logs de produção
docker compose ps          # Status dos containers
```

## Usuários de teste

| Role | Slug | E-mail | Senha |
|---|---|---|---|
| Owner | {{SLUG_TESTE}} | {{EMAIL_OWNER}} | {{SENHA}} |
| Atendente | {{SLUG_TESTE}} | {{EMAIL_ATENDENTE}} | {{SENHA}} |

> Crie os usuários de teste via `/cadastro` após o primeiro deploy.
