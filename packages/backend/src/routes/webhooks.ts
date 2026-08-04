import { Router } from 'express';
import express from 'express';
import { stripeWebhook } from '../controllers/stripeWebhookController';

const router = Router();

// express.raw() aqui é obrigatório: a verificação de assinatura do Stripe precisa
// do corpo bruto da requisição, não do JSON já parseado pelo express.json() global.
router.post('/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

export default router;
