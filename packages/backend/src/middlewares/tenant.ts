import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../config/database';

export async function tenantMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = req.user?.tenantId || (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant nao identificado' });
    }

    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    res.on('finish', async () => {
      await db.query('COMMIT');
    });

    res.on('close', async () => {
      await db.query('ROLLBACK');
    });

    next();
  } catch {
    return res.status(500).json({ error: 'Erro interno' });
  }
}