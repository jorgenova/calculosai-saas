# Guia de Template — Como gerar um novo SaaS

## Estratégia de scaffolding

### Recomendação: GitHub Template Repository + script de init

**Por que não `npm create` (estilo create-react-app)?**
Publicar e manter um pacote npm público é overhead desnecessário para uso pessoal ou de equipe pequena.

**Por que não só "clonar e editar na mão"?**
Inconsistências: esquecer de trocar um nome em `docker-compose.yml` ou no CI quebra o deploy silenciosamente.

**A abordagem adotada:**
1. Este repositório é configurado como **GitHub Template** (Settings → General → Template repository)
2. Para um projeto novo: clique em "Use this template" → cria novo repositório limpo
3. Clone localmente e rode `node scripts/create-saas.js`
4. O script faz todas as substituições e gera `SETUP-CHECKLIST.md` personalizado

Essa abordagem:
- Mantém histórico git limpo no projeto novo
- Não requer publicação de pacotes
- O checklist gerado garante que nenhum passo de infraestrutura seja esquecido

---

## O que é parametrizável no init

| Parâmetro | Onde aparece | Como o script trata |
|---|---|---|
| `slug` (ex: `meu-saas`) | package.json, docker-compose labels, paths VPS, CI | find/replace `saas-scaffolding` e `saas_scaffolding` |
| `displayName` (ex: `Meu SaaS`) | index.html title, ARCHITECTURE.md | find/replace `SaaS Scaffolding` |
| `domain` (ex: `meuapp.com.br`) | SETUP-CHECKLIST.md, ALLOWED_ORIGINS sugerido | inserido no checklist |
| Projeto Doppler | SETUP-CHECKLIST.md | inserido no checklist |
| `JWT_SECRET` | gerado automaticamente | 48 bytes aleatórios via `crypto.randomBytes` |

**O que o script NÃO troca automaticamente (requer decisão humana):**
- Price ID do Stripe (depende do produto e plano que você vai criar)
- Credenciais do Supabase (dependem do projeto criado)
- Sender do Resend (depende do domínio verificado)

---

## Core vs. Opcional

### Core — sempre presente, não remover

| Módulo | Arquivos | Por que é core |
|---|---|---|
| Auth JWT | `middlewares/auth.ts`, `config/jwt.ts`, `controllers/authController.ts` | Fundação de segurança |
| Multitenancy RLS | `middlewares/tenant.ts`, `middlewares/subdomain.ts` | Isolamento de dados |
| Onboarding | `controllers/onboardingController.ts`, `pages/Onboarding.tsx` | Entrada de novos clientes |
| CI bypassrls | `scripts/check-bypassrls.js`, job no ci.yml | Garantia de segurança no deploy |
| Docker + Traefik | `docker-compose.yml`, Dockerfiles | Infraestrutura de produção |
| Rate limiting | `config/rateLimit.ts`, `middlewares/rateLimiter.ts` | Proteção de endpoints públicos |
| Monorepo structure | package.json raiz, workspaces | Base para crescimento |

### Opcional — pode ser removido ou substituído

| Módulo | Arquivos para remover | Quando remover |
|---|---|---|
| **Stripe** | `config/stripe.ts`, imports em `onboardingController.ts` | SaaS sem cobrança imediata no cadastro |
| **Brasil API / CNPJ** | `config/cnpj.ts`, campo cnpj no schema e no formulário | Produto fora do Brasil |
| **Resend** | `config/email.ts`, `sendWelcomeEmail` em `onboardingController.ts` | Substituir por outro provider (SES, SendGrid) |
| **Invite de atendente** | `controllers/inviteController.ts`, `routes/invite.ts` | Produto single-user |
| **packages/shared** | diretório inteiro | Enquanto não houver tipos compartilhados |

**Como remover Stripe (exemplo):**
```bash
# 1. Remover do onboardingController.ts
# - import { createCustomer, createSubscription } from '../config/stripe'
# - const customer = await createCustomer(...)
# - const subscription = await createSubscription(...)
# - subscription: subscription.id do response

# 2. Remover config/stripe.ts

# 3. Remover do package.json do backend
npm uninstall stripe --workspace=packages/backend

# 4. Remover STRIPE_SECRET_KEY e STRIPE_PUBLIC_KEY do Doppler
```

---

## Provisionar secrets e banco para um projeto novo

### 1. Criar projeto Supabase

1. Novo projeto em supabase.com (região: sa-east-1 para Brasil)
2. Abrir SQL Editor e executar o schema completo (ver `docs/ARCHITECTURE.md` → "Schema do banco")
3. Criar migration_user e app_user com `CREATE ROLE ... WITH LOGIN PASSWORD '...'`
4. Conceder permissões (ver mesma seção)
5. Configurar RLS e policies

### 2. Configurar Doppler

```bash
# Criar projeto e ambientes via CLI
doppler projects create MEU-PROJETO
doppler configs create dev  --project MEU-PROJETO
doppler configs create prd  --project MEU-PROJETO

# Cadastrar cada secret via UI ou CLI
doppler secrets set DATABASE_URL "postgresql://postgres...." --project MEU-PROJETO --config prd
# ... demais secrets
```

### 3. Configurar VPS

```bash
# Na VPS (uma vez por projeto)
mkdir -p /var/www/MEU_SLUG
cd /var/www/MEU_SLUG
git clone https://github.com/SEU_USUARIO/MEU_PROJETO .
doppler configure set token  <SERVICE_TOKEN>  --scope /var/www/MEU_SLUG
doppler configure set project MEU-PROJETO     --scope /var/www/MEU_SLUG
doppler configure set config prd              --scope /var/www/MEU_SLUG
```

### 4. Primeiro deploy

```bash
npm ci
cd packages/backend && doppler run -- npx prisma migrate deploy && cd ../..
doppler run -- docker compose up -d --build
```

---

## Passo a passo: do zero ao SaaS rodando

```
1.  GitHub: clicar "Use this template" → criar repositório MEU-PROJETO
2.  Local: git clone https://github.com/SEU_USUARIO/MEU-PROJETO && cd MEU-PROJETO
3.  Local: npm ci
4.  Local: node scripts/create-saas.js  (preencher slug, nome, domínio)
5.  Local: ler SETUP-CHECKLIST.md gerado
6.  Supabase: criar projeto → executar SQL de schema → criar usuários → configurar RLS
7.  Doppler: criar projeto → cadastrar todos os secrets (incluindo JWT_SECRET gerado)
8.  Stripe: criar produto → copiar Price ID → atualizar Onboarding.tsx
9.  Resend: verificar domínio → atualizar remetente em config/email.ts
10. VPS: mkdir /var/www/MEU_SLUG → git clone → doppler configure
11. VPS: docker network create traefik-public (se não existir)
12. VPS: Traefik já rodando em /opt/traefik (compartilhado)
13. GitHub: cadastrar secrets VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT
14. Local: git add -A && git commit -m "init: meu-saas" && git push origin main
15. GitHub Actions: acompanhar pipeline (typecheck → bypassrls → deploy)
16. Browser: acessar http://IP_VPS/cadastro e testar onboarding
```

**Tempo estimado:** 2–3 horas na primeira vez (maior parte no Supabase + Doppler). Na segunda vez, com os serviços já configurados: ~45 minutos.
