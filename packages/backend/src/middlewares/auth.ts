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