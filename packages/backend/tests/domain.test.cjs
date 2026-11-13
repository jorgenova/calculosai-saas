const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isValidCpf,
  isValidCnpj,
  normalizeTaxId,
} = require('../dist/domain/taxIdentification.js')
const { planTaxRegimeChange } = require('../dist/domain/taxPeriod.js')

test('normalizes and validates CPF/CNPJ', () => {
  assert.equal(normalizeTaxId('529.982.247-25'), '52998224725')
  assert.equal(isValidCpf('529.982.247-25'), true)
  assert.equal(isValidCpf('111.111.111-11'), false)
  assert.equal(isValidCnpj('04.252.011/0001-10'), true)
  assert.equal(isValidCnpj('11.111.111/1111-11'), false)
})

test('plans contiguous tax periods', () => {
  assert.deepEqual(
    planTaxRegimeChange({ startDate: '2026-01-01', endDate: null }, '2026-07-01'),
    { currentEndDate: '2026-06-30', nextStartDate: '2026-07-01' },
  )
  assert.throws(
    () => planTaxRegimeChange({ startDate: '2026-01-01', endDate: null }, '2026-01-01'),
    /after/,
  )
})
