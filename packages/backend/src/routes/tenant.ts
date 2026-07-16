import { Router } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { Response } from 'express';

const router = Router();

router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, name, cnpj, slug FROM "Tenant" WHERE id = $1',
      [req.user?.tenantId]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar tenant:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;