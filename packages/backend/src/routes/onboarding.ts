import { Router } from 'express';
import { onboarding } from '../controllers/onboardingController';
import { onboardingRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/', onboardingRateLimiter, onboarding);

export default router;