import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendInviteEmail } from '../config/email';
import { AuthRequest } from '../middlewares/auth';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

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

    // So pode haver um convite pendente por e-mail por Tenant (docs/specs/tenant.md, UC-04)
    const conviteExists = await db.query(
      `SELECT id FROM "Convite"
       WHERE email = $1 AND "tenantId" = $2 AND status = 'pendente' AND "expiresAt" > NOW()`,
      [email, req.user.tenantId]
    );

    if (conviteExists.rows[0]) {
      return res.status(400).json({ error: 'Ja existe um convite pendente para este e-mail' });
    }

    // Busca dados do tenant para o e-mail
    const tenantResult = await db.query(
      'SELECT name, slug FROM "Tenant" WHERE id = $1',
      [req.user.tenantId]
    );

    const tenant = tenantResult.rows[0];

    // Gera o token de convite — o valor em claro so existe aqui; so o hash e
    // persistido (docs/specs/tenant.md, D-01)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SETE_DIAS_MS);

    await db.query(
      `INSERT INTO "Convite" (id, "tenantId", email, "tokenHash", "convidadoPorUserId", "expiresAt")
       VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5)`,
      [req.user.tenantId, email, tokenHash, req.user.userId, expiresAt]
    );

    // Best-effort: falha no envio nao desfaz o convite ja persistido (INV-12)
    try {
      await sendInviteEmail(email, tenant.name, tenant.slug, token);
    } catch (emailErr) {
      console.error('Erro ao enviar e-mail de convite (convite continua valido):', emailErr);
    }

    return res.status(200).json({
      message: 'Convite enviado com sucesso',
    });

  } catch (err) {
    console.error('Erro ao convidar atendente:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

// UC-06 (docs/specs/tenant.md): rota publica — quem aceita ainda nao tem conta.
export async function acceptInvite(req: Request, res: Response) {
  try {
    const { token, nome, senha } = req.body;

    if (!token || !nome || !senha) {
      return res.status(400).json({ error: 'Token, nome e senha sao obrigatorios' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const conviteResult = await db.query(
      `SELECT id, "tenantId", email FROM "Convite"
       WHERE "tokenHash" = $1 AND status = 'pendente' AND "expiresAt" > NOW()`,
      [tokenHash]
    );

    const convite = conviteResult.rows[0];

    if (!convite) {
      return res.status(400).json({ error: 'Convite invalido ou expirado' });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', convite.tenantId]
    );

    await db.query(
      `INSERT INTO "User" (id, "tenantId", name, email, password, role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, 'attendant', NOW(), NOW())`,
      [convite.tenantId, nome, convite.email, hashedPassword]
    );

    await db.query(
      `UPDATE "Convite" SET status = 'aceito' WHERE id = $1`,
      [convite.id]
    );

    await db.query('COMMIT');

    return res.status(201).json({ message: 'Convite aceito com sucesso' });

  } catch (err) {
    // ROLLBACK pode falhar tambem (ex: banco indisponivel) — nao deixar isso virar
    // uma segunda excecao nao tratada, que derrubaria o processo inteiro.
    await db.query('ROLLBACK').catch(() => {});
    console.error('Erro ao aceitar convite:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
