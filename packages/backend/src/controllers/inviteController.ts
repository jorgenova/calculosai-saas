import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendInviteEmail } from '../config/email';
import { AuthRequest } from '../middlewares/auth';
import crypto from 'crypto';

export async function inviteAttendant(req: AuthRequest, res: Response) {
  try {
    // Somente owner pode convidar
    if (req.user?.role !== 'owner') {
      return res.status(403).json({ error: 'Apenas o proprietario pode convidar atendentes' });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email obrigatorio' });
    }

    // Verifica se usuario ja existe no tenant
    const userExists = await db.query(
      'SELECT id FROM "User" WHERE email = $1 AND "tenantId" = $2',
      [email, req.user.tenantId]
    );

    if (userExists.rows[0]) {
      return res.status(400).json({ error: 'Usuario ja cadastrado neste tenant' });
    }

    // Busca dados do tenant para o e-mail
    const tenantResult = await db.query(
      'SELECT name, slug FROM "Tenant" WHERE id = $1',
      [req.user.tenantId]
    );

    const tenant = tenantResult.rows[0];

    // Gera token de convite
    const token = crypto.randomBytes(32).toString('hex');

    // Envia e-mail de convite
    await sendInviteEmail(email, tenant.name, tenant.slug, token);

    return res.status(200).json({
      message: 'Convite enviado com sucesso',
    });

  } catch (err) {
    console.error('Erro ao convidar atendente:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}