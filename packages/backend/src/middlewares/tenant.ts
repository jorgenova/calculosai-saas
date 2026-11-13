import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export async function tenantMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = req.user?.tenantId || (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant was not identified' });
    }

    next();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
