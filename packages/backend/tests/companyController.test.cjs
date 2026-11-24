const test = require('node:test')
const assert = require('node:assert/strict')

const database = require('../dist/config/database.js')
const controller = require('../dist/controllers/companyController.js')

const identity = { userId: 'user-1', tenantId: 'tenant-1', role: 'owner' }

function request({ body = {}, id = 'company-1' } = {}) {
  return {
    body,
    params: { id },
    header: (name) => name === 'X-Office-Id' ? 'office-1' : undefined,
    user: identity,
  }
}

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function withQueries(rowsByCall, inspected = []) {
  database.withTenantTransaction = async (_identity, work) => work({
    query: async (sql, values = []) => {
      inspected.push({ sql, values })
      const next = rowsByCall.shift() ?? []
      return { rows: next, rowCount: next.length }
    },
  })
}

test('creates a minimal company without profile fields', async () => {
  const queries = []
  withQueries([[{ id: 'company-1', name: 'Minimal Company' }], []], queries)
  const res = response()

  await controller.createCompany(request({
    body: {
      identificationType: 'cnpj', taxId: '04.252.011/0001-10', name: 'Minimal Company',
      taxRegime: 'simples_nacional', startDate: '2026-01-01',
    },
  }), res)

  assert.equal(res.statusCode, 201)
  assert.equal(res.payload.name, 'Minimal Company')
  assert.match(queries[0].sql, /INSERT INTO companies/)
  assert.doesNotMatch(queries[0].sql, /legal_name/)
})

test('returns an existing minimal Company with a null primary address', async () => {
  withQueries([
    [{ id: 'company-1', name: 'Minimal Company', legal_name: null, is_small_business: null }],
    [],
    [],
  ])
  const res = response()

  await controller.getCompany(request(), res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.name, 'Minimal Company')
  assert.equal(res.payload.legal_name, null)
  assert.equal(res.payload.primaryAddress, null)
  assert.deepEqual(res.payload.taxPeriods, [])
})

test('persists an allowlisted Company profile and rejects invalid input before writing', async () => {
  const queries = []
  withQueries([[{ id: 'company-1', legal_name: 'Company Legal Name', is_small_business: true }]], queries)
  const success = response()

  await controller.updateCompanyProfile(request({
    body: { legalName: 'Company Legal Name', isSmallBusiness: true, shareCapital: '1200.50' },
  }), success)

  assert.equal(success.statusCode, 200)
  assert.match(queries[0].sql, /legal_name = \$1/)
  assert.match(queries[0].sql, /is_small_business = \$2/)
  assert.match(queries[0].sql, /share_capital = \$3/)
  assert.deepEqual(queries[0].values.slice(0, 3), ['Company Legal Name', true, '1200.50'])

  const failure = response()
  await controller.updateCompanyProfile(request({ body: { annualRevenue: '12,00' } }), failure)
  assert.equal(failure.statusCode, 400)
  assert.equal(queries.length, 1)
})

test('returns not found rather than updating a Company outside the active Office', async () => {
  withQueries([[]])
  const res = response()

  await controller.updateCompanyProfile(request({ body: { tradeName: 'Unavailable Company' } }), res)

  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.payload, { error: 'Company was not found' })
})

test('updates the existing primary address instead of adding another one', async () => {
  const queries = []
  withQueries([
    [{ id: 'company-1' }],
    [{ id: 'address-1' }],
    [{ city: 'Curitiba', state: 'PR', is_primary: true }],
  ], queries)
  const res = response()

  await controller.upsertPrimaryAddress(request({ body: { city: 'Curitiba', state: 'PR' } }), res)

  assert.equal(res.statusCode, 200)
  assert.match(queries[2].sql, /UPDATE company_addresses/)
  assert.doesNotMatch(queries[2].sql, /INSERT INTO company_addresses/)
})
