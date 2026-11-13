import { Router } from 'express';
import { acceptInvite } from '../controllers/inviteController';

const router = Router();

// Public: users accepting an invitation do not have an account yet.
router.post('/aceitar', acceptInvite);
router.post('/accept', acceptInvite);

export default router;
