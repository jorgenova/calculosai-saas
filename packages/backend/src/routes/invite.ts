import { Router } from 'express';
import { inviteAttendant } from '../controllers/inviteController';

const router = Router();

router.post('/', inviteAttendant);

export default router;