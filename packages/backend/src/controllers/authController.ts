import { Request, Response } from 'express';
import { db } from '../config/database';
import { signToken } from '../config/jwt';
import bcrypt from 'bcrypt';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const tenantId = (req as any).tenantId;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatorios' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant nao identificado' });
    }

    // Seta o tenant antes da query — RLS funciona corretamente
    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    const result = await db.query(
      'SELECT id, "tenantId", password, role FROM "User" WHERE email = $1 AND "tenantId" = $2',
      [email, tenantId]
    );

    await db.query('COMMIT');

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const token = await signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return res.json({ token });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}