import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middlewares/auth';
import { tenantMiddleware } from './middlewares/tenant';
import { subdomainMiddleware } from './middlewares/subdomain';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenant';
import onboardingRoutes from './routes/onboarding';
import inviteRoutes from './routes/invite';
import conviteRoutes from './routes/convite';
import webhookRoutes from './routes/webhooks';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Antes do express.json() global: o proprio router de webhooks aplica
// express.raw() na rota do Stripe, que precisa do corpo bruto pra verificar a
// assinatura. Montado aqui tambem pula o subdomainMiddleware (a requisicao do
// Stripe nunca chega la, ja que este router responde e nao chama next()).
app.use('/webhooks', webhookRoutes);

app.use(express.json());

// Extrai tenant do subdominio em todos os requests, exceto onboarding e aceite de
// convite — em ambos quem chama ainda nao tem um contexto de tenant resolvido pelo
// subdominio (docs/specs/tenant.md, UC-01 e UC-06)
app.use((req, res, next) => {
  if (req.path.startsWith('/onboarding') || req.path.startsWith('/convite')) return next()
  subdomainMiddleware(req, res, next)
})

// Rotas publicas
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/convite', conviteRoutes);

// Rotas protegidas — auth + tenant
app.use(authMiddleware);
app.use(tenantMiddleware);

app.use('/tenant', tenantRoutes);
app.use('/invite', inviteRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;