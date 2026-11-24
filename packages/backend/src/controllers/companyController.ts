import { Response } from 'express';
import { OfficeAccessError, withTenantTransaction } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import {
  IdentificationType,
  isValidTaxId,
  normalizeTaxId,
} from '../domain/taxIdentification';
import { planTaxRegimeChange } from '../domain/taxPeriod';

const TAX_REGIMES = new Set([
  'mei',
  'simples_nacional',
  'lucro_presumido',
  'lucro_real',
]);

const PROFILE_FIELDS = {
  legalName: 'legal_name',
  tradeName: 'trade_name',
  isHeadquarters: 'is_headquarters',
  activityStartedAt: 'activity_started_at',
  legalNature: 'legal_nature',
  municipalRegistration: 'municipal_registration',
  stateRegistration: 'state_registration',
  suframaRegistration: 'suframa_registration',
  cei: 'cei',
  caepf: 'caepf',
  primaryCnaeCode: 'primary_cnae_code',
  preparationCnaeCode: 'preparation_cnae_code',
  activityDescription: 'activity_description',
  shareCapital: 'share_capital',
  annualRevenue: 'annual_revenue',
  isSmallBusiness: 'is_small_business',
} as const;

const ADDRESS_FIELDS = {
  postalCode: 'postal_code',
  streetType: 'street_type',
  street: 'street',
  number: 'number',
  complement: 'complement',
  neighborhood: 'neighborhood',
  district: 'district',
  cityCode: 'city_code',
  city: 'city',
  state: 'state',
  federalCode: 'federal_code',
} as const;

type ProfileField = keyof typeof PROFILE_FIELDS;
type AddressField = keyof typeof ADDRESS_FIELDS;

function invalidField(name: string): never {
  throw new Error(`Invalid ${name}`);
}

function nullableText(value: unknown, name: string, maxLength = 500): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) invalidField(name);
  return value.trim() || null;
}

function nullableDate(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalidField(name);
  return value;
}

function nullableMoney(value: unknown, name: string): string | null {
  if (value === null) return null;
  const normalized = typeof value === 'number' ? String(value) : value;
  if (typeof normalized !== 'string' || !/^\d{1,16}(?:\.\d{1,2})?$/.test(normalized)) invalidField(name);
  return normalized;
}

function nullableBoolean(value: unknown, name: string): boolean | null {
  if (value === null || typeof value === 'boolean') return value;
  return invalidField(name);
}

function validatedProfile(body: unknown): Array<[ProfileField, string | boolean | null]> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid profile');
  const input = body as Record<string, unknown>;
  const fields = Object.keys(input).filter((key): key is ProfileField => key in PROFILE_FIELDS);
  if (fields.length === 0 || Object.keys(input).some((key) => !(key in PROFILE_FIELDS))) {
    throw new Error('Profile requires supported fields');
  }
  return fields.map((field) => {
    const value = input[field];
    if (field === 'activityStartedAt') return [field, nullableDate(value, field)];
    if (field === 'shareCapital' || field === 'annualRevenue') return [field, nullableMoney(value, field)];
    if (field === 'isHeadquarters' || field === 'isSmallBusiness') return [field, nullableBoolean(value, field)];
    return [field, nullableText(value, field, field === 'activityDescription' ? 4000 : 255)];
  });
}

function validatedAddress(body: unknown): Array<[AddressField, string | null]> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid address');
  const input = body as Record<string, unknown>;
  const fields = Object.keys(input).filter((key): key is AddressField => key in ADDRESS_FIELDS);
  if (fields.length === 0 || Object.keys(input).some((key) => !(key in ADDRESS_FIELDS))) {
    throw new Error('Address requires supported fields');
  }
  return fields.map((field) => [field, nullableText(input[field], field, field === 'complement' ? 500 : 255)]);
}

function context(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const officeId = req.header('X-Office-Id');
  if (!officeId) {
    res.status(400).json({ error: 'X-Office-Id is required' });
    return null;
  }
  return { user: req.user, officeId };
}

function handleError(res: Response, error: unknown, operation: string) {
  if (error instanceof OfficeAccessError) {
    return res.status(403).json({ error: error.message });
  }
  const databaseError = error as { code?: string };
  if (databaseError?.code === '23505') {
    return res.status(409).json({ error: 'Tax identification is already registered in this office' });
  }
  console.error(`Failed to ${operation}:`, error);
  return res.status(500).json({ error: 'Internal server error' });
}

export async function createCompany(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  const identificationType = req.body.identificationType as IdentificationType;
  const taxId = normalizeTaxId(String(req.body.taxId ?? ''));
  const name = String(req.body.name ?? '').trim();
  const taxRegime = String(req.body.taxRegime ?? '');
  const startDate = String(req.body.startDate ?? new Date().toISOString().slice(0, 10));

  if (!['cpf', 'cnpj'].includes(identificationType)
      || !isValidTaxId(identificationType, taxId)
      || !name
      || !TAX_REGIMES.has(taxRegime)) {
    return res.status(400).json({ error: 'Valid identification, name, and tax regime are required' });
  }

  try {
    const company = await withTenantTransaction(scoped.user, async (client) => {
      const inserted = await client.query(
        `INSERT INTO companies (
           id, tenant_id, office_id, identification_type, tax_id, name, status,
           created_at, updated_at
         ) VALUES (
           gen_random_uuid()::TEXT, $1, $2, $3, $4, $5, 'active', NOW(), NOW()
         )
         RETURNING id, office_id, identification_type, tax_id, name, status,
                   created_at, updated_at`,
        [scoped.user.tenantId, scoped.officeId, identificationType, taxId, name]
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO company_tax_periods (
           id, tenant_id, office_id, company_id, tax_regime, start_date
         ) VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5::DATE)`,
        [scoped.user.tenantId, scoped.officeId, row.id, taxRegime, startDate]
      );
      return row;
    }, scoped.officeId);
    return res.status(201).json(company);
  } catch (error) {
    return handleError(res, error, 'create company');
  }
}

export async function listCompanies(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  const includeClosed = req.query.includeClosed === 'true';

  try {
    const companies = await withTenantTransaction(scoped.user, async (client) => {
      const result = await client.query(
        `SELECT c.id, c.identification_type, c.tax_id, c.name, c.status,
                c.requested_at, c.created_at, c.updated_at,
                p.tax_regime AS current_tax_regime, p.start_date AS tax_regime_start
           FROM companies c
           LEFT JOIN company_tax_periods p
             ON p.company_id = c.id AND p.end_date IS NULL
          WHERE c.tenant_id = $1 AND c.office_id = $2
            AND ($3::BOOLEAN OR c.status <> 'closed')
          ORDER BY c.name`,
        [scoped.user.tenantId, scoped.officeId, includeClosed]
      );
      return result.rows;
    }, scoped.officeId);
    return res.json(companies);
  } catch (error) {
    return handleError(res, error, 'list companies');
  }
}

export async function getCompany(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;

  try {
    const company = await withTenantTransaction(scoped.user, async (client) => {
      const found = await client.query(
        `SELECT id, identification_type, tax_id, name, legal_name, trade_name,
                is_headquarters, activity_started_at, legal_nature, municipal_registration,
                state_registration, suframa_registration, cei, caepf, primary_cnae_code,
                preparation_cnae_code, activity_description, share_capital, annual_revenue,
                is_small_business, status, requested_at, decided_at, created_at, updated_at
           FROM companies WHERE id = $1 AND tenant_id = $2 AND office_id = $3`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      if (!found.rows[0]) return null;
      const periods = await client.query(
        `SELECT id, tax_regime, start_date, end_date
           FROM company_tax_periods
          WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3
          ORDER BY start_date DESC`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      const address = await client.query(
        `SELECT postal_code, street_type, street, number, complement, neighborhood,
                district, city_code, city, state, federal_code, is_primary, created_at, updated_at
           FROM company_addresses
          WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND is_primary = TRUE`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      return { ...found.rows[0], taxPeriods: periods.rows, primaryAddress: address.rows[0] ?? null };
    }, scoped.officeId);
    if (!company) return res.status(404).json({ error: 'Company was not found' });
    return res.json(company);
  } catch (error) {
    return handleError(res, error, 'get company');
  }
}

export async function updateCompanyProfile(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  let fields: Array<[ProfileField, string | boolean | null]>;
  try {
    fields = validatedProfile(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid profile' });
  }

  try {
    const company = await withTenantTransaction(scoped.user, async (client) => {
      const assignments = fields.map(([field], index) => `${PROFILE_FIELDS[field]} = $${index + 1}`).join(', ');
      const values = fields.map(([, value]) => value);
      const result = await client.query(
        `UPDATE companies SET ${assignments}, updated_at = NOW()
          WHERE id = $${values.length + 1} AND tenant_id = $${values.length + 2} AND office_id = $${values.length + 3}
          RETURNING id, legal_name, trade_name, is_headquarters, activity_started_at, legal_nature,
                    municipal_registration, state_registration, suframa_registration, cei, caepf,
                    primary_cnae_code, preparation_cnae_code, activity_description, share_capital,
                    annual_revenue, is_small_business, updated_at`,
        [...values, req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      return result.rows[0] ?? null;
    }, scoped.officeId);
    if (!company) return res.status(404).json({ error: 'Company was not found' });
    return res.json(company);
  } catch (error) {
    return handleError(res, error, 'update company profile');
  }
}

export async function upsertPrimaryAddress(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  let fields: Array<[AddressField, string | null]>;
  try {
    fields = validatedAddress(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid address' });
  }

  try {
    const address = await withTenantTransaction(scoped.user, async (client) => {
      const company = await client.query(
        `SELECT id FROM companies WHERE id = $1 AND tenant_id = $2 AND office_id = $3 FOR UPDATE`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      if (!company.rows[0]) return null;
      const values = fields.map(([, value]) => value);
      const columns = fields.map(([field]) => ADDRESS_FIELDS[field]);
      const existing = await client.query(
        `SELECT id FROM company_addresses
          WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND is_primary = TRUE FOR UPDATE`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      const result = existing.rows[0]
        ? await client.query(
          `UPDATE company_addresses SET ${columns.map((column, index) => `${column} = $${index + 1}`).join(', ')}, updated_at = NOW()
            WHERE id = $${values.length + 1}
            RETURNING postal_code, street_type, street, number, complement, neighborhood, district,
                      city_code, city, state, federal_code, is_primary, created_at, updated_at`,
          [...values, existing.rows[0].id]
        )
        : await client.query(
          `INSERT INTO company_addresses (id, tenant_id, office_id, company_id, ${columns.join(', ')}, is_primary)
           VALUES (gen_random_uuid()::TEXT, $${values.length + 1}, $${values.length + 2}, $${values.length + 3}, ${columns.map((_, index) => `$${index + 1}`).join(', ')}, TRUE)
           RETURNING postal_code, street_type, street, number, complement, neighborhood, district,
                     city_code, city, state, federal_code, is_primary, created_at, updated_at`,
          [...values, scoped.user.tenantId, scoped.officeId, req.params.id]
        );
      return result.rows[0];
    }, scoped.officeId);
    if (!address) return res.status(404).json({ error: 'Company was not found' });
    return res.json(address);
  } catch (error) {
    return handleError(res, error, 'upsert primary company address');
  }
}

export async function changeTaxRegime(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  const taxRegime = String(req.body.taxRegime ?? '');
  const startDate = String(req.body.startDate ?? '');
  if (!TAX_REGIMES.has(taxRegime) || !startDate) {
    return res.status(400).json({ error: 'Tax regime and start date are required' });
  }

  try {
    const changed = await withTenantTransaction(scoped.user, async (client) => {
      const current = await client.query(
        `SELECT p.id, p.start_date, p.end_date
           FROM company_tax_periods p
           JOIN companies c ON c.id = p.company_id
          WHERE p.company_id = $1 AND p.tenant_id = $2 AND p.office_id = $3
            AND c.status <> 'closed' AND p.end_date IS NULL
          FOR UPDATE OF p`,
        [req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      if (!current.rows[0]) return null;
      const plan = planTaxRegimeChange({
        startDate: current.rows[0].start_date.toISOString().slice(0, 10),
        endDate: null,
      }, startDate);
      await client.query('UPDATE company_tax_periods SET end_date = $1::DATE WHERE id = $2', [
        plan.currentEndDate,
        current.rows[0].id,
      ]);
      const inserted = await client.query(
        `INSERT INTO company_tax_periods (
           id, tenant_id, office_id, company_id, tax_regime, start_date
         ) VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5::DATE)
         RETURNING id, tax_regime, start_date, end_date`,
        [scoped.user.tenantId, scoped.officeId, req.params.id, taxRegime, plan.nextStartDate]
      );
      return inserted.rows[0];
    }, scoped.officeId);
    if (!changed) return res.status(404).json({ error: 'Active company was not found' });
    return res.status(201).json(changed);
  } catch (error: any) {
    if (error instanceof Error && /period|Date/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    return handleError(res, error, 'change tax regime');
  }
}

async function ownerTransition(
  req: AuthRequest,
  res: Response,
  fromStatus: string,
  toStatus: string,
  operation: string
) {
  const scoped = context(req, res);
  if (!scoped) return;
  if (scoped.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can perform this action' });
  }

  try {
    const company = await withTenantTransaction(scoped.user, async (client) => {
      const result = await client.query(
        `UPDATE companies
            SET status = $1::company_status, decided_by_user_id = $2, decided_at = NOW(),
                requested_by_user_id = CASE WHEN $1::company_status = 'active' THEN NULL ELSE requested_by_user_id END,
                requested_at = CASE WHEN $1::company_status = 'active' THEN NULL ELSE requested_at END,
                updated_at = NOW()
          WHERE id = $3 AND tenant_id = $4 AND office_id = $5 AND status = $6
          RETURNING id, name, status, updated_at`,
        [toStatus, scoped.user.userId, req.params.id, scoped.user.tenantId, scoped.officeId, fromStatus]
      );
      return result.rows[0] ?? null;
    }, scoped.officeId);
    if (!company) return res.status(409).json({ error: 'Company is not in the required state' });
    return res.json(company);
  } catch (error) {
    return handleError(res, error, operation);
  }
}

export function closeCompany(req: AuthRequest, res: Response) {
  return ownerTransition(req, res, 'active', 'closed', 'close company');
}

export function approveClosure(req: AuthRequest, res: Response) {
  return ownerTransition(req, res, 'closure_pending', 'closed', 'approve company closure');
}

export function rejectClosure(req: AuthRequest, res: Response) {
  return ownerTransition(req, res, 'closure_pending', 'active', 'reject company closure');
}

export function reactivateCompany(req: AuthRequest, res: Response) {
  return ownerTransition(req, res, 'closed', 'active', 'reactivate company');
}

export async function requestClosure(req: AuthRequest, res: Response) {
  const scoped = context(req, res);
  if (!scoped) return;
  if (scoped.user.role !== 'attendant') {
    return res.status(403).json({ error: 'Owners close companies directly' });
  }

  try {
    const company = await withTenantTransaction(scoped.user, async (client) => {
      const result = await client.query(
        `UPDATE companies
            SET status = 'closure_pending', requested_by_user_id = $1,
                requested_at = NOW(), decided_by_user_id = NULL, decided_at = NULL,
                updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 AND office_id = $4 AND status = 'active'
          RETURNING id, name, status, requested_at`,
        [scoped.user.userId, req.params.id, scoped.user.tenantId, scoped.officeId]
      );
      return result.rows[0] ?? null;
    }, scoped.officeId);
    if (!company) return res.status(409).json({ error: 'Company is not active' });
    return res.json(company);
  } catch (error) {
    return handleError(res, error, 'request company closure');
  }
}
