# Semana 5 — Backend: Onboarding, Stripe, Resend e Convites

## Contexto

Nesta semana implementamos o fluxo completo de onboarding — criacao de tenant,
usuario proprietario, assinatura no Stripe, e-mail de boas vindas e convite de atendentes.

---

## Decisoes tomadas nesta semana

### Ordem correta do onboarding
O `tenant_id` deve ser gerado antes do INSERT para que o RLS funcione corretamente.
O `set_config` seta o contexto antes de qualquer query de escrita.

### Fluxo validado de ponta a ponta
1. Onboarding cria tenant + usuario + assinatura Stripe
2. Login via subdominio retorna JWT
3. JWT autentica em rotas protegidas
4. RLS filtra dados do tenant correto

---

## 1. Instalar dependencias

```bash
cd packages/backend
npm install resend stripe
```

---

## 2. Variaveis de ambiente

Adicionar no `.env` local e no Doppler (prd e dev):

```env
RESEND_API_KEY=re_SEU-TOKEN-AQUI
STRIPE_PUBLIC_KEY=pk_test_SEU-TOKEN-AQUI
STRIPE_SECRET_KEY=sk_test_SEU-TOKEN-AQUI
```

---

## 3. Arquivos criados

### `src/config/email.ts`
```typescript
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, tenantName: string, slug: string) {
  await resend.emails.send({
    from: 'noreply@seudominio.com.br',
    to,
    subject: `Bem-vindo ao ${tenantName}!`,
    html: `
      <h1>Bem-vindo, ${tenantName}!</h1>
      <p>Sua conta foi criada com sucesso.</p>
      <p>Acesse sua plataforma em: <a href="https://${slug}.seudominio.com.br">https://${slug}.seudominio.com.br</a></p>
    `,
  });
}

export async function sendInviteEmail(to: string, tenantName: string, slug: string, token: string) {
  await resend.emails.send({
    from: 'noreply@seudominio.com.br',
    to,
    subject: `Voce foi convidado para ${tenantName}`,
    html: `
      <h1>Voce foi convidado!</h1>
      <p>Voce foi convidado para acessar ${tenantName}.</p>
      <p>Clique no link para aceitar o convite:</p>
      <a href="https://${slug}.seudominio.com.br/convite?token=${token}">Aceitar convite</a>
    `,
  });
}
```

### `src/config/stripe.ts`
```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function createCustomer(email: string, name: string) {
  return stripe.customers.create({ email, name });
}

export async function createSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
}
```

### `src/controllers/onboardingController.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendWelcomeEmail } from '../config/email';
import { createCustomer, createSubscription } from '../config/stripe';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function onboarding(req: Request, res: Response) {
  try {
    const { name, email, password, companyName, cnpj, slug, priceId } = req.body;

    if (!name || !email || !password || !companyName || !cnpj || !slug || !priceId) {
      return res.status(400).json({ error: 'Todos os campos sao obrigatorios' });
    }

    // Verifica se CNPJ ja existe
    const cnpjExists = await db.query(
      'SELECT id FROM "Tenant" WHERE cnpj = $1',
      [cnpj]
    );
    if (cnpjExists.rows[0]) {
      return res.status(400).json({ error: 'CNPJ ja cadastrado' });
    }

    // Verifica se slug ja existe
    const slugExists = await db.query(
      'SELECT id FROM "Tenant" WHERE slug = $1',
      [slug]
    );
    if (slugExists.rows[0]) {
      return res.status(400).json({ error: 'Slug ja em uso' });
    }

    // Cria cliente e assinatura no Stripe
    const customer = await createCustomer(email, companyName);
    const subscription = await createSubscription(customer.id, priceId);

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Gera o ID do tenant antes de inserir — necessario para o RLS
    const tenantId = crypto.randomUUID();

    // Seta tenant no contexto ANTES do INSERT
    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    // Cria tenant
    await db.query(
      `INSERT INTO "Tenant" (id, name, cnpj, slug, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [tenantId, companyName, cnpj, slug]
    );

    // Cria usuario proprietario
    await db.query(
      `INSERT INTO "User" (id, "tenantId", name, email, password, role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, 'owner', NOW(), NOW())`,
      [tenantId, name, email, hashedPassword]
    );

    await db.query('COMMIT');

    // Envia e-mail de boas vindas
    await sendWelcomeEmail(email, companyName, slug);

    return res.status(201).json({
      message: 'Conta criada com sucesso',
      tenantId,
      subscription: subscription.id,
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Erro no onboarding:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
```

### `src/controllers/inviteController.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendInviteEmail } from '../config/email';
import { AuthRequest } from '../middlewares/auth';
import crypto from 'crypto';

export async function inviteAttendant(req: AuthRequest, res: Response) {
  try {
    // Somente owner pode convidar
    if (req.user?.role !== 'owner') {
      return res.status(403).json({ error: 'Apenas o proprietario pode convidar atendentes' });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email obrigatorio' });
    }

    // Verifica se usuario ja existe no tenant
    const userExists = await db.query(
      'SELECT id FROM "User" WHERE email = $1 AND "tenantId" = $2',
      [email, req.user.tenantId]
    );
    if (userExists.rows[0]) {
      return res.status(400).json({ error: 'Usuario ja cadastrado neste tenant' });
    }

    // Busca dados do tenant para o e-mail
    const tenantResult = await db.query(
      'SELECT name, slug FROM "Tenant" WHERE id = $1',
      [req.user.tenantId]
    );
    const tenant = tenantResult.rows[0];

    // Gera token de convite
    const token = crypto.randomBytes(32).toString('hex');

    // Envia e-mail de convite
    await sendInviteEmail(email, tenant.name, tenant.slug, token);

    return res.status(200).json({
      message: 'Convite enviado com sucesso',
    });

  } catch (err) {
    console.error('Erro ao convidar atendente:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
```

### `src/routes/onboarding.ts`
```typescript
import { Router } from 'express';
import { onboarding } from '../controllers/onboardingController';
import { onboardingRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/', onboardingRateLimiter, onboarding);

export default router;
```

### `src/routes/invite.ts`
```typescript
import { Router } from 'express';
import { inviteAttendant } from '../controllers/inviteController';

const router = Router();

router.post('/', inviteAttendant);

export default router;
```

### `src/index.ts` atualizado
```typescript
import 'dotenv/config';
import express from 'express';
import { authMiddleware } from './middlewares/auth';
import { tenantMiddleware } from './middlewares/tenant';
import { subdomainMiddleware } from './middlewares/subdomain';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenant';
import onboardingRoutes from './routes/onboarding';
import inviteRoutes from './routes/invite';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Extrai tenant do subdominio em todos os requests
app.use(subdomainMiddleware);

// Rotas publicas
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/onboarding', onboardingRoutes);

// Rotas protegidas — auth + tenant
app.use(authMiddleware);
app.use(tenantMiddleware);

app.use('/tenant', tenantRoutes);
app.use('/invite', inviteRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
```

---

## 4. Testar o fluxo completo

```bash
# 1. Onboarding
curl -X POST http://localhost:3000/onboarding -H "Content-Type: application/json" -d '{"name":"Jorge Nova","email":"jorge@teste.com","password":"senha123","companyName":"Nova Empresa","cnpj":"98765432000100","slug":"nova-empresa","priceId":"price_SEU-PRICE-ID"}'

# 2. Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -H "Host: nova-empresa.localhost.com" -d '{"email":"jorge@teste.com","password":"senha123"}'

# 3. Rota protegida
curl http://localhost:3000/tenant/me -H "Authorization: Bearer SEU-TOKEN-AQUI"
```

---

## Checklist Semana 5

- [x] Resend configurado
- [x] Stripe configurado — produto e plano criados
- [x] Onboarding criando tenant + usuario + assinatura Stripe
- [x] E-mail de boas vindas via Resend
- [x] Rota de convite de atendentes
- [x] Fluxo completo testado de ponta a ponta
- [x] RLS preservado em todo o fluxo
