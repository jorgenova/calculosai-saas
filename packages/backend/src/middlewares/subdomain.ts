import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

// Deteccao de slug por subdominio (host.split('.')[0]) fica desativada por
// enquanto: nao existe DNS coringa nem subdominio real de tenant configurado
// ainda, e contar partes do host da erro falso-positivo em qualquer host de
// 3 partes que nao seja um subdominio de tenant de verdade — por exemplo o
// hostname gerado por um Cloudflare Quick Tunnel (palavra.trycloudflare.com).
// Quando o roteamento por subdominio for implementado de verdade, reintroduzir
// isso amarrado ao dominio real do produto (ex.: host.endsWith('.' + BASE_DOMAIN)),
// nao a uma contagem generica de pontos.
export async function subdomainMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const slug: string | undefined = req.body?.slug;

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