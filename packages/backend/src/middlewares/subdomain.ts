import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host)
}

export async function subdomainMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const host = req.headers.host || '';
    const parts = host.split('.');

    let slug: string | undefined;

    if (!isIpAddress(host) && parts.length >= 3) {
      slug = parts[0];
    } else if (req.body?.slug) {
      slug = req.body.slug;
    }

    if (!slug) {
      return next();
    }

    const result = await db.query(
      'SELECT id FROM "Tenant" WHERE slug = $1',
      [slug]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tenant nao encontrado' });
    }

    (req as any).tenantId = result.rows[0].id;

    next();
  } catch {
    return res.status(500).json({ error: 'Erro interno' });
  }
}