import { Request, Response } from 'express';
import { setDatabaseContext, withTransaction } from '../config/database';
import { signToken } from '../config/jwt';
import bcrypt from 'bcrypt';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const tenantId = (req as any).tenantId;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant was not identified' });
    }

    const user = await withTransaction(async (client) => {
      await setDatabaseContext(client, { tenantId });
      const result = await client.query(
        'SELECT id, tenant_id, password, role FROM users WHERE email = $1 AND tenant_id = $2',
        [email, tenantId]
      );
      return result.rows[0];
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = await signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
    });

    return res.json({ token });
  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
