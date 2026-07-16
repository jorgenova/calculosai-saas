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

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// Extrai tenant do subdominio em todos os requests, exceto onboarding
app.use((req, res, next) => {
  if (req.path.startsWith('/onboarding')) return next()
  subdomainMiddleware(req, res, next)
})

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