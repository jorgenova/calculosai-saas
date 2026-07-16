# Semana 4 — Backend: Auth, JWT e Tenant

## Contexto

Nesta semana implementamos o core do backend — Express com TypeScript,
autenticacao JWT com `jose`, middleware de subdominio, middleware de tenant
com RLS e rate limiting com Upstash Redis.

---

## Decisoes tomadas nesta semana

### Login via subdominio
A estrategia de login escolhida foi via subdominio:
- **Principal:** `empresa.seudominio.com.br`
- O backend extrai o slug do subdominio, busca o `tenantId` e seta o
  `app.current_tenant` antes de qualquer query — RLS funciona corretamente

### Backlog semana 8
- Login alternativo por CNPJ em `seudominio.com.br/entrar`
- Recuperacao de subdominio por e-mail

### Policy publica de slug no Tenant
O slug e uma informacao publica — necessario para o fluxo de login.
Foi criada uma policy que permite busca por slug sem tenant setado:

```sql
DROP POLICY tenant_select ON "Tenant";

CREATE POLICY tenant_select ON "Tenant" FOR SELECT
  USING (
    slug IS NOT NULL
    OR id = current_setting('app.current_tenant', true)::TEXT
  );
```

### Coluna slug na tabela Tenant
```sql
ALTER TABLE "Tenant" ADD COLUMN slug TEXT UNIQUE;
```

---

## 1. Instalar dependencias

```bash
cd packages/backend

npm install express jose dotenv pg bcrypt
npm install -D @types/express @types/pg @types/bcrypt ts-node-dev
npm install @upstash/ratelimit @upstash/redis
```

---

## 2. Estrutura de pastas

```bash
mkdir -p src/middlewares src/routes src/controllers src/config
```

---

## 3. Arquivos criados

### `src/index.ts`
```typescript
import 'dotenv/config';
import express from 'express';
import { authMiddleware } from './middlewares/auth';
import { tenantMiddleware } from './middlewares/tenant';
import { subdomainMiddleware } from './middlewares/subdomain';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenant';

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

// Rotas protegidas — auth + tenant
app.use(authMiddleware);
app.use(tenantMiddleware);

app.use('/tenant', tenantRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
```

### `src/config/jwt.ts`
```typescript
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const ALGORITHM = 'HS256';

export async function signToken(payload: {
  userId: string;
  tenantId: string;
  role: 'owner' | 'attendant';
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [ALGORITHM],
  });
  return payload;
}
```

### `src/config/database.ts`
```typescript
import { Pool } from 'pg';

// Pool para runtime — app_user, sujeito ao RLS
export const db = new Pool({
  connectionString: process.env.DATABASE_URL_APP,
});

db.on('error', (err) => {
  console.error('Erro inesperado no pool do banco:', err);
});
```

### `src/config/rateLimit.ts`
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'),
  prefix: 'login',
});

export const onboardingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'onboarding',
});

export const cnpjLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'cnpj',
});
```

### `src/middlewares/auth.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;
    role: 'owner' | 'attendant';
  };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token nao fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);

    req.user = {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      role: payload.role as 'owner' | 'attendant',
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido' });
  }
}
```

### `src/middlewares/tenant.ts`
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../config/database';

export async function tenantMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = req.user?.tenantId || (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant nao identificado' });
    }

    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    res.on('finish', async () => {
      await db.query('COMMIT');
    });

    res.on('close', async () => {
      await db.query('ROLLBACK');
    });

    next();
  } catch {
    return res.status(500).json({ error: 'Erro interno' });
  }
}
```

### `src/middlewares/subdomain.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

export async function subdomainMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const host = req.headers.host || '';
    const parts = host.split('.');

    // Ignora localhost e dominios sem subdominio
    if (parts.length < 3) {
      return next();
    }

    const slug = parts[0];

    const result = await db.query(
      'SELECT id FROM "Tenant" WHERE slug = $1',
      [slug]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tenant nao encontrado' });
    }

    (req as any).tenantId = result.rows[0].id;

    next();
  } catch {
    return res.status(500).json({ error: 'Erro interno' });
  }
}
```

### `src/middlewares/rateLimiter.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { loginLimiter, onboardingLimiter, cnpjLimiter } from '../config/rateLimit';

async function applyLimit(
  limiter: typeof loginLimiter,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || 'unknown';
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({
      error: 'Muitas tentativas. Tente novamente mais tarde.',
    });
  }

  next();
}

export const loginRateLimiter = (req: Request, res: Response, next: NextFunction) =>
  applyLimit(loginLimiter, req, res, next);

export const onboardingRateLimiter = (req: Request, res: Response, next: NextFunction) =>
  applyLimit(onboardingLimiter, req, res, next);

export const cnpjRateLimiter = (req: Request, res: Response, next: NextFunction) =>
  applyLimit(cnpjLimiter, req, res, next);
```

### `src/controllers/authController.ts`
```typescript
import { Request, Response } from 'express';
import { db } from '../config/database';
import { signToken } from '../config/jwt';
import bcrypt from 'bcrypt';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const tenantId = (req as any).tenantId;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatorios' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant nao identificado' });
    }

    // Seta o tenant antes da query — RLS funciona corretamente
    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    const result = await db.query(
      'SELECT id, "tenantId", password, role FROM "User" WHERE email = $1 AND "tenantId" = $2',
      [email, tenantId]
    );

    await db.query('COMMIT');

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const token = await signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return res.json({ token });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
```

### `src/routes/auth.ts`
```typescript
import { Router } from 'express';
import { login } from '../controllers/authController';
import { loginRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/login', loginRateLimiter, login);

export default router;
```

### `src/routes/tenant.ts`
```typescript
import { Router } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { Response } from 'express';

const router = Router();

router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, name, cnpj, slug FROM "Tenant" WHERE id = $1',
      [req.user?.tenantId]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar tenant:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
```

---

## 4. Variaveis de ambiente

Adicionar no `.env` local e no Doppler (prd e dev):

```env
DATABASE_URL="postgresql://migration_user:SENHA@host:5432/postgres"
DATABASE_URL_APP="postgresql://app_user:SENHA@host:5432/postgres"
JWT_SECRET=valor-gerado-pelo-openssl
UPSTASH_REDIS_REST_URL=https://SEU-URL.upstash.io
UPSTASH_REDIS_REST_TOKEN=SEU-TOKEN-AQUI
```

Gera o JWT_SECRET com:

```bash
openssl rand -base64 32
```

---

## 5. Testar o fluxo completo

```bash
# 1. Login via subdominio
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Host: empresa-teste.localhost.com" \
  -d '{"email": "admin@teste.com", "password": "senha123"}'

# 2. Rota protegida com token retornado
curl http://localhost:3000/tenant/me -H "Authorization: Bearer SEU-TOKEN-AQUI"
```

---

## 6. Dados de teste no banco

```sql
-- Adiciona coluna slug
ALTER TABLE "Tenant" ADD COLUMN slug TEXT UNIQUE;

-- Insere tenant de teste
INSERT INTO "Tenant" (id, name, cnpj, "createdAt")
VALUES (
  gen_random_uuid()::TEXT,
  'Empresa Teste',
  '12345678000190',
  NOW()
);

-- Atualiza slug
UPDATE "Tenant"
SET slug = 'empresa-teste'
WHERE cnpj = '12345678000190';

-- Gera hash da senha no terminal
-- node -e "const bcrypt = require('bcrypt'); bcrypt.hash('senha123', 10).then(h => console.log(h));"

-- Insere usuario de teste
INSERT INTO "User" (id, "tenantId", name, email, password, role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::TEXT,
  'ID-DO-TENANT-AQUI',
  'Admin Teste',
  'admin@teste.com',
  'HASH-BCRYPT-AQUI',
  'owner',
  NOW(),
  NOW()
);
```

---

## Checklist Semana 4

- [x] Express configurado com TypeScript
- [x] Middleware JWT com jose — algoritmo fixado em HS256
- [x] Middleware de subdominio — extrai tenant pelo slug
- [x] Middleware de tenant com set_config parametrizado
- [x] COMMIT no finish e ROLLBACK no close garantidos
- [x] Rate limiting com Upstash Redis
- [x] Rota de login funcionando com RLS preservado
- [x] Rota protegida /tenant/me testada com sucesso
- [x] Upstash Redis configurado
- [x] Variaveis de ambiente no Doppler (prd e dev)
