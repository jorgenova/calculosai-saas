const { randomUUID } = require('node:crypto')
const { Client } = require('pg')

const adminUrl = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres_test_only@127.0.0.1:5433/calculosai_test'
const appUrl = process.env.DATABASE_URL_APP
  || 'postgresql://app_user:app_test_only@127.0.0.1:5433/calculosai_test'

const admin = new Client({ connectionString: adminUrl, ssl: false })
const app = new Client({ connectionString: appUrl, ssl: false })

const tenantA = randomUUID()
const tenantB = randomUUID()
const suffix = randomUUID().slice(0, 8)

async function verify() {
  await admin.connect()
  await app.connect()

  try {
    const role = await admin.query(
      `SELECT rolbypassrls, rolsuper
         FROM pg_roles
        WHERE rolname = 'app_user'`
    )

    if (!role.rows[0] || role.rows[0].rolbypassrls || role.rows[0].rolsuper) {
      throw new Error('app_user ausente ou com privilegios que ignoram RLS')
    }

    const tables = await admin.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relname IN ('Tenant', 'User', 'Convite')
        ORDER BY relname`
    )

    if (tables.rowCount !== 3 || tables.rows.some((table) => !table.relrowsecurity || !table.relforcerowsecurity)) {
      throw new Error('Tabelas esperadas ausentes ou sem ENABLE/FORCE RLS')
    }

    await admin.query(
      `INSERT INTO "Tenant" (id, name, cnpj, slug)
       VALUES ($1, 'Tenant A', $3, $5), ($2, 'Tenant B', $4, $6)`,
      [tenantA, tenantB, `test-a-${suffix}`, `test-b-${suffix}`, `test-a-${suffix}`, `test-b-${suffix}`]
    )
    await admin.query(
      `INSERT INTO "User" (id, "tenantId", name, email, password, role)
       VALUES ($1, $2, 'User A', $5, 'hash', 'owner'),
              ($3, $4, 'User B', $6, 'hash', 'owner')`,
      [randomUUID(), tenantA, randomUUID(), tenantB, `a-${suffix}@example.test`, `b-${suffix}@example.test`]
    )

    const withoutTenant = await app.query('SELECT id FROM "User"')
    if (withoutTenant.rowCount !== 0) {
      throw new Error('RLS permitiu consultar usuarios sem contexto de tenant')
    }

    await app.query('BEGIN')
    await app.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantA])

    const scopedUsers = await app.query('SELECT "tenantId" FROM "User"')
    if (scopedUsers.rowCount !== 1 || scopedUsers.rows[0].tenantId !== tenantA) {
      throw new Error('RLS nao isolou corretamente os usuarios do tenant A')
    }

    let crossTenantInsertBlocked = false
    await app.query('SAVEPOINT before_cross_tenant_insert')
    try {
      await app.query(
        `INSERT INTO "User" (id, "tenantId", name, email, password, role)
         VALUES ($1, $2, 'Intruso', $3, 'hash', 'attendant')`,
        [randomUUID(), tenantB, `intruso-${suffix}@example.test`]
      )
    } catch (error) {
      crossTenantInsertBlocked = error.code === '42501'
      await app.query('ROLLBACK TO SAVEPOINT before_cross_tenant_insert')
    }

    if (!crossTenantInsertBlocked) {
      throw new Error('RLS nao bloqueou INSERT para outro tenant')
    }

    await app.query('ROLLBACK')
    console.log('OK: PostgreSQL acessivel, schema completo e isolamento RLS validado.')
  } finally {
    await app.query('ROLLBACK').catch(() => {})
    await admin.query('DELETE FROM "User" WHERE "tenantId" = ANY($1::text[])', [[tenantA, tenantB]]).catch(() => {})
    await admin.query('DELETE FROM "Tenant" WHERE id = ANY($1::text[])', [[tenantA, tenantB]]).catch(() => {})
    await app.end().catch(() => {})
    await admin.end().catch(() => {})
  }
}

verify().catch((error) => {
  console.error(`Falha na verificacao do banco de testes: ${error.message}`)
  process.exitCode = 1
})
