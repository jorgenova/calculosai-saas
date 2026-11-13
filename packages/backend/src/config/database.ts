import { Pool, PoolClient } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL_APP,
});

db.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export type DbClient = PoolClient;

export type RequestIdentity = {
  userId: string;
  tenantId: string;
  role: 'owner' | 'attendant';
};

export class OfficeAccessError extends Error {
  constructor(message = 'Office access was denied') {
    super(message);
    this.name = 'OfficeAccessError';
  }
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function setDatabaseContext(
  client: PoolClient,
  context: {
    tenantId: string;
    userId?: string;
    role?: 'owner' | 'attendant';
    officeId?: string;
  }
) {
  await client.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant',
    context.tenantId,
  ]);

  if (context.userId) {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_user',
      context.userId,
    ]);
  }

  if (context.role) {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_role',
      context.role,
    ]);
  }

  if (context.officeId) {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_office',
      context.officeId,
    ]);
  }
}

export async function withTenantTransaction<T>(
  identity: RequestIdentity,
  work: (client: PoolClient) => Promise<T>,
  officeId?: string
): Promise<T> {
  return withTransaction(async (client) => {
    await setDatabaseContext(client, { ...identity, officeId });

    if (officeId) {
      const access = await client.query<{ allowed: boolean }>(
        'SELECT can_access_office($1, $2, $3) AS allowed',
        [identity.tenantId, identity.userId, officeId]
      );

      if (!access.rows[0]?.allowed) {
        throw new OfficeAccessError();
      }

      const office = await client.query(
        'SELECT id FROM offices WHERE id = $1 AND tenant_id = $2',
        [officeId, identity.tenantId]
      );

      if (!office.rows[0]) {
        throw new OfficeAccessError();
      }
    }

    return work(client);
  });
}
