import { Request, Response } from 'express';
import { sendInviteEmail } from '../config/email';
import { setDatabaseContext, withTenantTransaction, withTransaction } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteAttendant(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can invite attendants' });
  }

  const email = String(req.body.email ?? '').trim().toLowerCase();
  const officeIds = Array.isArray(req.body.officeIds)
    ? [...new Set(req.body.officeIds.map(String))] as string[]
    : [];
  if (!email || officeIds.length === 0) {
    return res.status(400).json({ error: 'Email and at least one office are required' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  try {
    const outcome = await withTenantTransaction(req.user, async (client) => {
      const offices = await client.query(
        'SELECT id FROM offices WHERE tenant_id = $1 AND id = ANY($2::TEXT[])',
        [req.user!.tenantId, officeIds]
      );
      if (offices.rowCount !== officeIds.length) return { kind: 'invalid_offices' as const };

      const existing = await client.query(
        'SELECT id, role FROM users WHERE email = $1 AND tenant_id = $2',
        [email, req.user!.tenantId]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].role !== 'attendant') return { kind: 'owner_email' as const };
        for (const officeId of officeIds) {
          await client.query(
            `INSERT INTO office_accesses (id, tenant_id, user_id, office_id)
             VALUES (gen_random_uuid()::TEXT, $1, $2, $3)
             ON CONFLICT (user_id, office_id) DO NOTHING`,
            [req.user!.tenantId, existing.rows[0].id, officeId]
          );
        }
        return { kind: 'access_granted' as const };
      }

      const pending = await client.query(
        `SELECT id FROM invitations WHERE email = $1 AND tenant_id = $2
          AND status = 'pending' AND expires_at > NOW()`,
        [email, req.user!.tenantId]
      );
      if (pending.rows[0]) return { kind: 'pending' as const };

      const tenant = await client.query('SELECT name, slug FROM tenants WHERE id = $1', [req.user!.tenantId]);
      const invitation = await client.query(
        `INSERT INTO invitations (id, tenant_id, email, token_hash, invited_by_user_id, expires_at)
         VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5) RETURNING id`,
        [req.user!.tenantId, email, tokenHash, req.user!.userId, expiresAt]
      );
      for (const officeId of officeIds) {
        await client.query(
          `INSERT INTO invitation_offices (id, tenant_id, invitation_id, office_id)
           VALUES (gen_random_uuid()::TEXT, $1, $2, $3)`,
          [req.user!.tenantId, invitation.rows[0].id, officeId]
        );
      }
      return {
        kind: 'invited' as const,
        tenantName: tenant.rows[0].name,
        tenantSlug: tenant.rows[0].slug,
      };
    });

    if (outcome.kind === 'invalid_offices') return res.status(400).json({ error: 'Every office must belong to this account' });
    if (outcome.kind === 'owner_email') return res.status(400).json({ error: 'The owner already has access to every office' });
    if (outcome.kind === 'pending') return res.status(409).json({ error: 'A pending invitation already exists for this email' });
    if (outcome.kind === 'access_granted') return res.status(200).json({ message: 'Office access granted' });

    try {
      await sendInviteEmail(email, outcome.tenantName, outcome.tenantSlug, token);
    } catch (emailError) {
      console.error('Failed to send invitation email (invitation remains valid):', emailError);
    }
    return res.status(200).json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Failed to invite attendant:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function acceptInvite(req: Request, res: Response) {
  const { token, name, password } = req.body;
  if (!token || !String(name).trim() || !password) {
    return res.status(400).json({ error: 'Token, name, and password are required' });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();

  try {
    const result = await withTransaction(async (client) => {
      const invitationResult = await client.query(
        `SELECT id, tenant_id, email, expires_at FROM invitations
          WHERE token_hash = $1 AND status = 'pending'`,
        [tokenHash]
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) return { kind: 'invalid' as const };

      // The validated one-time token authorizes this system-level provisioning transaction.
      await setDatabaseContext(client, { tenantId: invitation.tenant_id, userId, role: 'owner' });
      if (new Date(invitation.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE invitations SET status = 'expired' WHERE id = $1`, [invitation.id]);
        return { kind: 'expired' as const };
      }

      const officeRows = await client.query(
        'SELECT office_id FROM invitation_offices WHERE invitation_id = $1 AND tenant_id = $2',
        [invitation.id, invitation.tenant_id]
      );
      if (officeRows.rowCount === 0) return { kind: 'invalid' as const };

      await client.query(
        `INSERT INTO users (id, tenant_id, name, email, password, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'attendant', NOW(), NOW())`,
        [userId, invitation.tenant_id, String(name).trim(), invitation.email, hashedPassword]
      );
      for (const office of officeRows.rows) {
        await client.query(
          `INSERT INTO office_accesses (id, tenant_id, user_id, office_id)
           VALUES (gen_random_uuid()::TEXT, $1, $2, $3)`,
          [invitation.tenant_id, userId, office.office_id]
        );
      }
      await client.query(`UPDATE invitations SET status = 'accepted' WHERE id = $1`, [invitation.id]);
      return { kind: 'accepted' as const };
    });

    if (result.kind === 'invalid') return res.status(400).json({ error: 'Invitation is invalid or already used' });
    if (result.kind === 'expired') return res.status(400).json({ error: 'Invitation has expired' });
    return res.status(201).json({ message: 'Invitation accepted successfully' });
  } catch (error: any) {
    if (error?.code === '23505') return res.status(409).json({ error: 'User is already registered for this account' });
    console.error('Failed to accept invitation:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
