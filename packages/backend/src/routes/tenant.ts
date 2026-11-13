import { Router } from 'express';
import { withTenantTransaction } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { Response } from 'express';

const router = Router();

router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const tenant = await withTenantTransaction(req.user, async (client) => {
      const result = await client.query(
        'SELECT id, name, slug, status FROM tenants WHERE id = $1',
        [req.user!.tenantId]
      );
      return result.rows[0];
    });

    return res.json(tenant);
  } catch (err) {
    console.error('Failed to fetch tenant:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
