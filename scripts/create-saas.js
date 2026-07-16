#!/usr/bin/env node

/**
 * Inicializa um novo projeto SaaS a partir deste template.
 * Uso: node scripts/create-saas.js
 */

const fs   = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')

const ROOT = path.resolve(__dirname, '..')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

// Arquivos onde o nome/slug do projeto aparece
const FILES_TO_PATCH = [
  'package.json',
  'docker-compose.yml',
  '.github/workflows/ci.yml',
  'packages/frontend/index.html',
  'packages/backend/package.json',
  'docs/ARCHITECTURE.md',
]

function replaceInFile(filePath, replacements) {
  const abs = path.join(ROOT, filePath)
  if (!fs.existsSync(abs)) return
  let content = fs.readFileSync(abs, 'utf8')
  for (const [from, to] of replacements) {
    content = content.split(from).join(to)
  }
  fs.writeFileSync(abs, content)
}

function generateSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url')
}

async function main() {
  console.log('\n=== Criar novo SaaS a partir do template ===\n')

  const slug        = await ask('Slug do projeto (ex: meu-saas): ')
  const displayName = await ask('Nome de exibição (ex: Meu SaaS): ')
  const domain      = await ask('Domínio (ex: meuapp.com.br) [Enter para pular]: ')
  const doppler     = await ask('Projeto no Doppler (ex: meu-saas) [Enter = mesmo slug]: ')

  rl.close()

  if (!slug.match(/^[a-z0-9-]+$/)) {
    console.error('Slug deve conter apenas letras minúsculas, números e hífens.')
    process.exit(1)
  }

  const slugUnder   = slug.replace(/-/g, '_')
  const dopplerName = doppler.trim() || slug
  const jwtSecret   = generateSecret()

  const replacements = [
    ['saas-scaffolding', slug],
    ['saas_scaffolding', slugUnder],
    ['SaaS Scaffolding', displayName],
    ['scaffolding-api',      `${slug}-api`],
    ['scaffolding-frontend', `${slug}-frontend`],
  ]

  console.log('\nAtualizando arquivos...')
  for (const file of FILES_TO_PATCH) {
    replaceInFile(file, replacements)
    console.log(`  ✓ ${file}`)
  }

  // Gera checklist de setup personalizado
  const varDir = path.join(ROOT, 'var_www_path')
  const checklist = `# Setup: ${displayName}

Gerado em: ${new Date().toISOString().slice(0, 10)}

## Secrets gerados automaticamente

JWT_SECRET=${jwtSecret}
(copie para o Doppler antes de subir)

## Checklist de infraestrutura

### 1. Supabase
- [ ] Criar projeto no Supabase (região: sa-east-1)
- [ ] Executar o SQL de criação de schema (ver docs/ARCHITECTURE.md)
- [ ] Criar migration_user e app_user com senhas fortes
- [ ] Confirmar: app_user tem rolbypassrls = false

### 2. Doppler
- [ ] Criar projeto "${dopplerName}" com ambientes dev e prd
- [ ] Cadastrar secrets:
    DATABASE_URL            = postgresql://postgres.PROJECT_ID:SENHA@pooler/postgres
    DATABASE_URL_APP        = postgresql://app_user.PROJECT_ID:SENHA@pooler/postgres
    JWT_SECRET              = ${jwtSecret}
    UPSTASH_REDIS_REST_URL  = ...
    UPSTASH_REDIS_REST_TOKEN= ...
    RESEND_API_KEY          = ...
    STRIPE_SECRET_KEY       = sk_test_...
    STRIPE_PUBLIC_KEY       = pk_test_...
    ALLOWED_ORIGINS         = ${domain ? `https://${domain}` : 'http://SEU_IP'}

### 3. Stripe
- [ ] Criar produto e Price ID
- [ ] Atualizar PRICE_ID em packages/frontend/src/pages/Onboarding.tsx

### 4. VPS
- [ ] Docker instalado e usuário no grupo docker
- [ ] Rede traefik-public criada: docker network create traefik-public
- [ ] Traefik rodando em /opt/traefik/
- [ ] Doppler configurado: doppler configure set ... --scope /var/www/${slugUnder}
- [ ] Repositório clonado em /var/www/${slugUnder}

### 5. GitHub Actions
- [ ] Secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT
- [ ] Atualizar path do safe.directory no ci.yml se necessário

### 6. DNS${domain ? `
- [ ] Apontar ${domain} → IP da VPS
- [ ] Adicionar *.${domain} → IP da VPS (para subdomínios de tenant)` : `
- [ ] (domínio não configurado — sistema sobe em HTTP pelo IP)
`}

## Primeiro deploy

\`\`\`bash
ssh -p PORTA deploy@IP_VPS
cd /var/www/${slugUnder}
git pull origin main
doppler run -- npx prisma migrate deploy
doppler run -- docker compose up -d --build
\`\`\`
`

  fs.writeFileSync(path.join(ROOT, 'SETUP-CHECKLIST.md'), checklist)
  console.log('  ✓ SETUP-CHECKLIST.md')

  console.log(`
=== Concluído ===

Projeto: ${displayName} (${slug})
JWT_SECRET gerado: ${jwtSecret.slice(0, 16)}...

Próximos passos:
  1. Leia SETUP-CHECKLIST.md
  2. Configure o Doppler com os secrets listados (incluindo o JWT_SECRET acima)
  3. Faça o primeiro commit: git add -A && git commit -m "init: ${slug}"
  4. Siga o checklist de infraestrutura
`)
}

main().catch(e => { console.error(e); process.exit(1) })
