import { Router } from 'express';
import { acceptInvite } from '../controllers/inviteController';

const router = Router();

// Publico: quem aceita um convite ainda nao tem conta (docs/specs/tenant.md, UC-06)
router.post('/aceitar', acceptInvite);

export default router;
