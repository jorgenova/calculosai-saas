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