import { Response } from 'express';
import { DbClient, OfficeAccessError, RequestIdentity, withTenantTransaction } from '../config/database';
import { AuthRequest } from './auth';

export const payrollPermissions = ['read', 'write', 'approve', 'transmit', 'health_documents'] as const;
export type PayrollPermission = typeof payrollPermissions[number];

type PayrollCompany = {
  id: string;
  name: string;
  status: 'active' | 'closure_pending' | 'closed';
  tax_id: string;
  identification_type: 'cnpj' | 'cpf';
};

export type PayrollContext = {
  user: RequestIdentity;
  officeId: string;
  company: PayrollCompany;
  permissions: PayrollPermission[];
};

export class PayrollError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: Record<string, string>) {
    super(message);
    this.name = 'PayrollError';
  }
}

export async function withPayrollContext<T>(
  user: RequestIdentity,
  officeId: string,
  companyId: string,
  permission: PayrollPermission,
  action: (client: DbClient, context: PayrollContext) => Promise<T>,
): Promise<T> {
  return withTenantTransaction(user, async (client) => {
    const { rows: [company] } = await client.query<PayrollCompany>(
      'SELECT id, name, status, tax_id, identification_type FROM companies WHERE id = $1 AND tenant_id = $2 AND office_id = $3',
      [companyId, user.tenantId, officeId],
    );
    if (!company) throw new PayrollError(404, 'Company was not found');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_company', company.id]);

    const permissions = user.role === 'owner' ? [...payrollPermissions] : (
      await client.query<{ permission: PayrollPermission }>(
        'SELECT permission FROM payroll_accesses WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND user_id = $4',
        [company.id, user.tenantId, officeId, user.userId],
      )
    ).rows.map(row => row.permission);

    if (!permissions.includes('read') || !permissions.includes(permission)) {
      throw new PayrollError(403, 'Payroll access was denied');
    }
    return action(client, { user, officeId, company, permissions });
  }, officeId);
}

type PayrollResponse<T> = (response: Response, data: T, request: AuthRequest) => void | Promise<void>;

export function sendPayrollDocument(response: Response, document: { filename: string; html: string }) {
  response.set('Cache-Control', 'private, no-store');
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  response.attachment(document.filename).type('html').send(document.html);
}

export function payrollAction<T>(
  permission: PayrollPermission,
  action: (client: DbClient, context: PayrollContext, request: AuthRequest) => Promise<T>,
  respond: PayrollResponse<T> = (response, data) => { response.json(data); },
) {
  return async (request: AuthRequest, response: Response) => {
    if (!request.user) return response.status(401).json({ error: 'Authentication required' });
    const officeId = request.header('X-Office-Id');
    if (!officeId) return response.status(400).json({ error: 'X-Office-Id is required' });

    try {
      const data = await withPayrollContext(request.user, officeId, request.params.companyId, permission,
        (client, context) => action(client, context, request));
      await respond(response, data, request);
    } catch (error) {
      if (error instanceof PayrollError) {
        return response.status(error.status).json({ error: error.message, fields: error.fields });
      }
      if (error instanceof OfficeAccessError) return response.status(403).json({ error: error.message });
      const code = (error as { code?: string })?.code;
      if (code === '23505' || code === '23P01') return response.status(409).json({ error: 'Payroll records conflict' });
      console.error('Payroll request failed', { code: code ?? 'unexpected' });
      return response.status(500).json({ error: 'Internal server error' });
    }
  };
}
