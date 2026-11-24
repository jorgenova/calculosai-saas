const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
const { Client } = require('pg')

const adminUrl = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres_test_only@127.0.0.1:5433/calculosai_test'
const appUrl = process.env.DATABASE_URL_APP
  || 'postgresql://app_user:app_test_only@127.0.0.1:5433/calculosai_test'
const admin = new Client({ connectionString: adminUrl, ssl: false })
const app = new Client({ connectionString: appUrl, ssl: false })

const ids = {
  tenantA: randomUUID(), tenantB: randomUUID(), ownerA: randomUUID(), ownerB: randomUUID(),
  attendantA: randomUUID(), officeA1: randomUUID(), officeA2: randomUUID(), officeB: randomUUID(),
}
const suffix = randomUUID().slice(0, 8)

async function setContext(tenantId, userId, role, officeId) {
  await app.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId])
  await app.query('SELECT set_config($1, $2, true)', ['app.current_user', userId])
  await app.query('SELECT set_config($1, $2, true)', ['app.current_role', role])
  if (officeId) await app.query('SELECT set_config($1, $2, true)', ['app.current_office', officeId])
}

async function verifyPayrollIsolation() {
  const { tenantA, ownerA, attendantA, officeA1, officeA2 } = ids
  const companyA = (await admin.query('SELECT id FROM companies WHERE office_id = $1', [officeA1])).rows[0].id
  const otherCompany = randomUUID()
  const documentId = randomUUID()
  await app.query('BEGIN')
  try {
    await setContext(tenantA, ownerA, 'owner', officeA1)
    await app.query('SELECT set_config($1, $2, true)', ['app.current_company', companyA])
    await app.query(
      "INSERT INTO companies (id, tenant_id, office_id, identification_type, tax_id, name) VALUES ($1, $2, $3, 'cpf', '52998224725', 'Other Company')",
      [otherCompany, tenantA, officeA1],
    )
    const { rows: [person] } = await app.query(
      "INSERT INTO payroll_people (tenant_id, office_id, company_id, cpf, full_name) VALUES ($1, $2, $3, '52998224725', 'Test Worker') RETURNING id",
      [tenantA, officeA1, companyA],
    )
    const { rows: [engagement] } = await app.query(
      "INSERT INTO payroll_engagements (tenant_id, office_id, company_id, person_id, kind) VALUES ($1, $2, $3, $4, 'employee') RETURNING id",
      [tenantA, officeA1, companyA, person.id],
    )
    const { rows: [input] } = await app.query(
      "INSERT INTO payroll_inputs (tenant_id, office_id, company_id, engagement_id, kind, starts_on, value) VALUES ($1, $2, $3, $4, 'leave', '2026-11-01', '{}') RETURNING id",
      [tenantA, officeA1, companyA, engagement.id],
    )
    await app.query(
      "INSERT INTO payroll_documents (id, tenant_id, office_id, company_id, input_id, kind, storage_key, content_type) VALUES ($1, $2, $3, $4, $5, 'health_attachment', $6, 'application/pdf')",
      [documentId, tenantA, officeA1, companyA, input.id, randomUUID()],
    )
    await app.query(
      "INSERT INTO payroll_accesses (tenant_id, office_id, company_id, user_id, permission) VALUES ($1, $2, $3, $4, 'read')",
      [tenantA, officeA1, companyA, attendantA],
    )

    await setContext(tenantA, attendantA, 'attendant', officeA1)
    assert.equal((await app.query('SELECT id FROM payroll_people')).rowCount, 1)
    assert.equal((await app.query('SELECT id FROM payroll_inputs')).rowCount, 1)
    assert.equal((await app.query('SELECT id FROM payroll_documents')).rowCount, 0)
    assert.equal((await app.query("UPDATE payroll_people SET full_name = 'Unauthorized' WHERE id = $1", [person.id])).rowCount, 0)

    await app.query('SELECT set_config($1, $2, true)', ['app.current_company', otherCompany])
    assert.equal((await app.query('SELECT id FROM payroll_people')).rowCount, 0)

    await setContext(tenantA, ownerA, 'owner', officeA2)
    await app.query('SELECT set_config($1, $2, true)', ['app.current_company', companyA])
    assert.equal((await app.query('SELECT id FROM payroll_people')).rowCount, 0)

    await setContext(tenantA, ownerA, 'owner', officeA1)
    await app.query(
      "INSERT INTO payroll_accesses (tenant_id, office_id, company_id, user_id, permission) VALUES ($1, $2, $3, $4, 'health_documents')",
      [tenantA, officeA1, companyA, attendantA],
    )
    await setContext(tenantA, attendantA, 'attendant', officeA1)
    assert.deepEqual((await app.query('SELECT id FROM payroll_documents')).rows, [{ id: documentId }])
    await app.query(
      "INSERT INTO payroll_audits (tenant_id, office_id, company_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4, 'read_health_document', $5)",
      [tenantA, officeA1, companyA, attendantA, documentId],
    )
    assert.equal((await app.query('SELECT id FROM payroll_audits')).rowCount, 1)
  } finally {
    await app.query('ROLLBACK')
  }
}

async function verify() {
  await admin.connect(); await app.connect()
  try {
    const role = await admin.query(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_user'`)
    if (!role.rows[0] || role.rows[0].rolbypassrls || role.rows[0].rolsuper) {
      throw new Error('app_user has unsafe privileges')
    }
    const expected = [
      'companies', 'company_addresses', 'company_tax_periods', 'invitation_offices', 'invitations', 'office_accesses', 'offices', 'tenants', 'users',
      'payroll_accesses', 'payroll_audits', 'payroll_compensation', 'payroll_deliveries', 'payroll_dependents',
      'payroll_documents', 'payroll_employer_memberships', 'payroll_employer_settings', 'payroll_employers', 'payroll_engagements', 'payroll_events',
      'payroll_guides', 'payroll_inputs', 'payroll_payments', 'payroll_people', 'payroll_periods', 'payroll_policies',
      'payroll_statements', 'payroll_versions',
    ]
    const tables = await admin.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = ANY($1::TEXT[]) ORDER BY relname`, [expected]
    )
    if (tables.rowCount !== expected.length || tables.rows.some((row) => !row.relrowsecurity || !row.relforcerowsecurity)) {
      throw new Error('Expected tables are missing or RLS is incomplete')
    }

    await admin.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Account A', $3), ($2, 'Account B', $4)`,
      [ids.tenantA, ids.tenantB, `account-a-${suffix}`, `account-b-${suffix}`])
    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, password, role) VALUES
       ($1,$2,'Owner A',$6,'hash','owner'), ($3,$2,'Attendant A',$7,'hash','attendant'),
       ($4,$5,'Owner B',$8,'hash','owner')`,
      [ids.ownerA, ids.tenantA, ids.attendantA, ids.ownerB, ids.tenantB,
        `owner-a-${suffix}@test.dev`, `attendant-a-${suffix}@test.dev`, `owner-b-${suffix}@test.dev`]
    )
    await admin.query(
      `INSERT INTO offices (id, tenant_id, name, cnpj) VALUES
       ($1,$2,'Office A1',$6), ($3,$2,'Office A2',$7), ($4,$5,'Office B',$8)`,
      [ids.officeA1, ids.tenantA, ids.officeA2, ids.officeB, ids.tenantB,
        `10${suffix.padEnd(12, '0')}`.slice(0, 14), `20${suffix.padEnd(12, '0')}`.slice(0, 14), `30${suffix.padEnd(12, '0')}`.slice(0, 14)]
    )
    await admin.query(`INSERT INTO office_accesses (tenant_id,user_id,office_id) VALUES ($1,$2,$3)`,
      [ids.tenantA, ids.attendantA, ids.officeA1])

    const unscoped = await app.query('SELECT id FROM users')
    if (unscoped.rowCount !== 0) throw new Error('RLS exposed users without context')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.ownerA, 'owner')
    const ownerOffices = await app.query('SELECT id FROM offices ORDER BY id')
    if (ownerOffices.rowCount !== 2) throw new Error('Owner did not receive every office')
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.attendantA, 'attendant')
    const attendantOffices = await app.query('SELECT id FROM offices')
    if (attendantOffices.rowCount !== 1 || attendantOffices.rows[0].id !== ids.officeA1) {
      throw new Error('Attendant office access was not isolated')
    }
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.ownerA, 'owner', ids.officeA1)
    const companyA1 = await app.query(
      `INSERT INTO companies (tenant_id,office_id,identification_type,tax_id,name)
       VALUES ($1,$2,'cnpj','04252011000110','Shared Company')
       RETURNING id`, [ids.tenantA, ids.officeA1])
    const companyA1Id = companyA1.rows[0].id
    await app.query(
      `UPDATE companies SET legal_name = 'Shared Company Legal Name', is_headquarters = TRUE
        WHERE id = $1`, [companyA1Id])
    await app.query(
      `INSERT INTO company_addresses (tenant_id, office_id, company_id, city, state, is_primary)
       VALUES ($1, $2, $3, 'São Paulo', 'SP', TRUE)`,
      [ids.tenantA, ids.officeA1, companyA1Id])
    await app.query(
      `UPDATE company_addresses SET city = 'Campinas'
        WHERE company_id = $1 AND is_primary = TRUE`, [companyA1Id])
    const primaryAddressCount = await app.query(
      `SELECT COUNT(*)::INTEGER AS count FROM company_addresses
        WHERE company_id = $1 AND is_primary = TRUE`, [companyA1Id])
    if (primaryAddressCount.rows[0].count !== 1) {
      throw new Error('Company has more than one primary address after an update')
    }
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.ownerA, 'owner', ids.officeA2)
    await app.query(
      `INSERT INTO companies (tenant_id,office_id,identification_type,tax_id,name)
       VALUES ($1,$2,'cnpj','04252011000110','Shared Company')`, [ids.tenantA, ids.officeA2])
    const scopedCompanies = await app.query('SELECT office_id FROM companies')
    if (scopedCompanies.rowCount !== 1 || scopedCompanies.rows[0].office_id !== ids.officeA2) {
      throw new Error('Company data crossed office boundaries')
    }

    const hiddenProfile = await app.query(
      'SELECT legal_name FROM companies WHERE id = $1', [companyA1Id])
    const hiddenAddress = await app.query(
      'SELECT id FROM company_addresses WHERE company_id = $1', [companyA1Id])
    const rejectedProfileUpdate = await app.query(
      `UPDATE companies SET legal_name = 'Cross-office update' WHERE id = $1`, [companyA1Id])
    const rejectedAddressUpdate = await app.query(
      `UPDATE company_addresses SET city = 'Cross-office update' WHERE company_id = $1`, [companyA1Id])
    if (hiddenProfile.rowCount !== 0 || hiddenAddress.rowCount !== 0
      || rejectedProfileUpdate.rowCount !== 0 || rejectedAddressUpdate.rowCount !== 0) {
      throw new Error('Company profile or address crossed office boundaries')
    }

    let duplicateInOfficeBlocked = false
    await app.query('SAVEPOINT before_duplicate_company')
    try {
      await app.query(
        `INSERT INTO companies (tenant_id,office_id,identification_type,tax_id,name)
         VALUES ($1,$2,'cnpj','04252011000110','Duplicate')`, [ids.tenantA, ids.officeA2])
    } catch (error) {
      duplicateInOfficeBlocked = error.code === '23505'
      await app.query('ROLLBACK TO SAVEPOINT before_duplicate_company')
    }
    if (!duplicateInOfficeBlocked) throw new Error('Same office accepted a duplicate tax identification')
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.attendantA, 'attendant', ids.officeA1)
    const attendantCompanies = await app.query('SELECT office_id FROM companies')
    if (attendantCompanies.rowCount !== 1 || attendantCompanies.rows[0].office_id !== ids.officeA1) {
      throw new Error('Attendant could not read the authorized office company')
    }
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.attendantA, 'attendant', ids.officeA2)
    const unauthorizedCompanies = await app.query('SELECT id FROM companies')
    if (unauthorizedCompanies.rowCount !== 0) throw new Error('Attendant read an unauthorized office company')
    let unauthorizedWriteBlocked = false
    try {
      await app.query(
        `INSERT INTO companies (tenant_id,office_id,identification_type,tax_id,name)
         VALUES ($1,$2,'cpf','52998224725','Unauthorized')`, [ids.tenantA, ids.officeA2])
    } catch (error) {
      unauthorizedWriteBlocked = error.code === '42501'
    }
    if (!unauthorizedWriteBlocked) throw new Error('Attendant wrote to an unauthorized office')
    await app.query('ROLLBACK')

    await app.query('BEGIN')
    await setContext(ids.tenantB, ids.ownerB, 'owner', ids.officeA1)
    const otherTenantCompanies = await app.query('SELECT id FROM companies')
    if (otherTenantCompanies.rowCount !== 0) throw new Error('Company data crossed tenant boundaries')
    await app.query('COMMIT')

    await app.query('BEGIN')
    await setContext(ids.tenantA, ids.ownerA, 'owner')

    let ownerAccessBlocked = false
    await app.query('SAVEPOINT before_owner_access')
    try {
      await app.query(
        `INSERT INTO office_accesses (tenant_id,user_id,office_id) VALUES ($1,$2,$3)`,
        [ids.tenantA, ids.ownerA, ids.officeA1])
    } catch (error) {
      ownerAccessBlocked = error.code === '23514'
      await app.query('ROLLBACK TO SAVEPOINT before_owner_access')
    }
    if (!ownerAccessBlocked) throw new Error('Database accepted an OfficeAccess for the owner')

    let crossTenantAccessBlocked = false
    await app.query('SAVEPOINT before_cross_tenant_access')
    try {
      await app.query(
        `INSERT INTO office_accesses (tenant_id,user_id,office_id) VALUES ($1,$2,$3)`,
        [ids.tenantA, ids.attendantA, ids.officeB])
    } catch (error) {
      crossTenantAccessBlocked = error.code === '23503'
      await app.query('ROLLBACK TO SAVEPOINT before_cross_tenant_access')
    }
    if (!crossTenantAccessBlocked) throw new Error('Database accepted cross-tenant OfficeAccess')

    let secondOwnerBlocked = false
    await app.query('SAVEPOINT before_owner')
    try {
      await app.query(`INSERT INTO users (tenant_id,name,email,password,role) VALUES ($1,'Other',$2,'hash','owner')`,
        [ids.tenantA, `other-${suffix}@test.dev`])
    } catch (error) {
      secondOwnerBlocked = error.code === '23505'; await app.query('ROLLBACK TO SAVEPOINT before_owner')
    }
    if (!secondOwnerBlocked) throw new Error('Database accepted a second owner')
    await app.query('COMMIT')
    await verifyPayrollIsolation()
    console.log('OK: schema, office and company isolation, payroll permissions, and health document auditing were validated.')
  } finally {
    await app.query('ROLLBACK').catch(() => {})
    await admin.query('DELETE FROM company_addresses WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM company_tax_periods WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM companies WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM invitation_offices WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM office_accesses WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM invitations WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM users WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM offices WHERE tenant_id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await admin.query('DELETE FROM tenants WHERE id = ANY($1::text[])', [[ids.tenantA, ids.tenantB]]).catch(() => {})
    await app.end().catch(() => {}); await admin.end().catch(() => {})
  }
}

verify().catch((error) => { console.error(`Test database verification failed: ${error.message}`); process.exitCode = 1 })
