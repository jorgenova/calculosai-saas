import { Response } from 'express';
import { withTenantTransaction } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { isValidCnpj, normalizeTaxId } from '../domain/taxIdentification';

function requireUser(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return req.user;
}

function requireOwner(req: AuthRequest, res: Response) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'owner') {
    res.status(403).json({ error: 'Only the owner can manage offices' });
    return null;
  }
  return user;
}

export async function listOffices(req: AuthRequest, res: Response) {
  const user = requireUser(req, res);
  if (!user) return;

  try {
    const offices = await withTenantTransaction(user, async (client) => {
      const result = await client.query(
        `SELECT id, name, cnpj, created_at, updated_at
           FROM offices
          WHERE tenant_id = $1
          ORDER BY name`,
        [user.tenantId]
      );
      return result.rows;
    });
    return res.json(offices);
  } catch (error) {
    console.error('Failed to list offices:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createOffice(req: AuthRequest, res: Response) {
  const user = requireOwner(req, res);
  if (!user) return;
  const { name, cnpj } = req.body;
  const normalizedCnpj = normalizeTaxId(String(cnpj ?? ''));

  if (!String(name ?? '').trim() || !isValidCnpj(normalizedCnpj)) {
    return res.status(400).json({ error: 'Name and a valid CNPJ are required' });
  }

  try {
    const office = await withTenantTransaction(user, async (client) => {
      const result = await client.query(
        `INSERT INTO offices (id, tenant_id, name, cnpj, created_at, updated_at)
         VALUES (gen_random_uuid()::TEXT, $1, $2, $3, NOW(), NOW())
         RETURNING id, name, cnpj, created_at, updated_at`,
        [user.tenantId, String(name).trim(), normalizedCnpj]
      );
      return result.rows[0];
    });
    return res.status(201).json(office);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'CNPJ is already registered' });
    }
    console.error('Failed to create office:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listOfficeUsers(req: AuthRequest, res: Response) {
  const user = requireOwner(req, res);
  if (!user) return;

  try {
    const users = await withTenantTransaction(user, async (client) => {
      const result = await client.query(
        `SELECT u.id, u.name, u.email,
                COALESCE(
                  array_agg(oa.office_id ORDER BY oa.office_id)
                    FILTER (WHERE oa.office_id IS NOT NULL),
                  ARRAY[]::TEXT[]
                ) AS office_ids
           FROM users u
           LEFT JOIN office_accesses oa
             ON oa.user_id = u.id AND oa.tenant_id = u.tenant_id
          WHERE u.tenant_id = $1 AND u.role = 'attendant'
          GROUP BY u.id, u.name, u.email
          ORDER BY u.name`,
        [user.tenantId]
      );
      return result.rows;
    });
    return res.json(users);
  } catch (error) {
    console.error('Failed to list office users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function grantOfficeAccess(req: AuthRequest, res: Response) {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const { officeId } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'User is required' });

  try {
    const access = await withTenantTransaction(owner, async (client) => {
      const office = await client.query(
        'SELECT id FROM offices WHERE id = $1 AND tenant_id = $2',
        [officeId, owner.tenantId]
      );
      const attendant = await client.query(
        `SELECT id FROM users
          WHERE id = $1 AND tenant_id = $2 AND role = 'attendant'`,
        [userId, owner.tenantId]
      );
      if (!office.rows[0] || !attendant.rows[0]) return null;

      const result = await client.query(
        `INSERT INTO office_accesses (id, tenant_id, user_id, office_id)
         VALUES (gen_random_uuid()::TEXT, $1, $2, $3)
         ON CONFLICT (user_id, office_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id, user_id, office_id`,
        [owner.tenantId, userId, officeId]
      );
      return result.rows[0];
    });

    if (!access) return res.status(404).json({ error: 'Office or attendant was not found' });
    return res.status(200).json(access);
  } catch (error) {
    console.error('Failed to grant office access:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function revokeOfficeAccess(req: AuthRequest, res: Response) {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const { officeId, userId } = req.params;

  try {
    const removed = await withTenantTransaction(owner, async (client) => {
      const result = await client.query(
        `DELETE FROM office_accesses
          WHERE tenant_id = $1 AND office_id = $2 AND user_id = $3
          RETURNING id`,
        [owner.tenantId, officeId, userId]
      );
      return result.rowCount === 1;
    });
    if (!removed) return res.status(404).json({ error: 'Office access was not found' });
    return res.status(200).json({ message: 'Office access revoked' });
  } catch (error) {
    console.error('Failed to revoke office access:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
