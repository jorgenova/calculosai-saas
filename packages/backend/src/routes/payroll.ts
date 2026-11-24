import { Router } from 'express';
import { readPayrollFile } from '../config/payrollFiles';
import { PayrollError, payrollAction, payrollPermissions } from '../middlewares/payroll';
import payrollPeople from './payrollPeople';
import payrollPolicies from './payrollPolicies';
import payrollPreview from './payrollPreview';
import payrollVacation from './payrollVacation';
import payrollGuides from './payrollGuides';
import payrollEsocial from './payrollEsocial';

const router = Router({ mergeParams: true });
router.use('/people', payrollPeople);
router.use('/policies', payrollPolicies);
router.use('/periods', payrollPreview);
router.use('/vacations', payrollVacation);
router.use('/guides', payrollGuides);
router.use('/esocial', payrollEsocial);

router.get('/', payrollAction('read', async (_client, context) => ({
  companyId: context.company.id,
  companyName: context.company.name,
  permissions: context.permissions,
})));

router.get('/access', payrollAction('read', async (client, context) => {
  if (context.user.role !== 'owner') throw new PayrollError(403, 'Only the owner can manage payroll access');
  const { rows } = await client.query(
    `SELECT u.id, u.name, coalesce(array_agg(p.permission ORDER BY p.permission)
         FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
       FROM users u JOIN office_accesses a ON a.user_id = u.id AND a.tenant_id = u.tenant_id
       LEFT JOIN payroll_accesses p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
         AND p.office_id = a.office_id AND p.company_id = $3
      WHERE u.tenant_id = $1 AND a.office_id = $2 AND u.role = 'attendant'
      GROUP BY u.id, u.name ORDER BY u.name, u.id`,
    [context.user.tenantId, context.officeId, context.company.id],
  );
  return rows;
}));

router.put('/access/:userId', payrollAction('write', async (client, context, request) => {
  if (context.user.role !== 'owner') throw new PayrollError(403, 'Only the owner can manage payroll access');
  const requested: unknown = request.body?.permissions;
  if (!Array.isArray(requested)
      || requested.some(permission => !payrollPermissions.includes(permission))
      || (requested.length > 0 && !requested.includes('read'))) {
    throw new PayrollError(400, 'Payroll permissions must include read access');
  }
  const permissions = [...new Set(requested)];
  const { tenantId } = context.user;
  const targetId = request.params.userId;
  const access = await client.query(
    `SELECT u.id FROM users u JOIN office_accesses a ON a.user_id = u.id AND a.tenant_id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2 AND a.office_id = $3 AND u.role = 'attendant'`,
    [targetId, tenantId, context.officeId],
  );
  if (!access.rows.length) throw new PayrollError(404, 'Office attendant was not found');
  const scope = [context.company.id, tenantId, context.officeId, targetId];
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(['payroll-access', ...scope])]);
  await client.query('DELETE FROM payroll_accesses WHERE company_id = $1 AND tenant_id = $2 AND office_id = $3 AND user_id = $4', scope);
  await client.query(
    `INSERT INTO payroll_accesses (company_id, tenant_id, office_id, user_id, permission)
     SELECT $1, $2, $3, $4, permission FROM unnest($5::text[]) AS permission`,
    [...scope, permissions],
  );
  await client.query(
    'INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [context.company.id, tenantId, context.officeId, context.user.userId, 'change_payroll_access', targetId],
  );
  return { userId: targetId, permissions };
}));

router.get('/documents/:documentId', payrollAction('read', async (client, context, request) => {
  const { rows: [document] } = await client.query<{ id: string; kind: string; storage_key: string; content_type: string; content: Buffer | null }>(
    `SELECT id, kind, storage_key, content_type, content FROM payroll_documents
      WHERE id = $1 AND company_id = $2 AND tenant_id = $3 AND office_id = $4`,
    [request.params.documentId, context.company.id, context.user.tenantId, context.officeId],
  );
  if (!document) throw new PayrollError(404, 'Payroll document was not found');
  const content = document.content ?? await readPayrollFile(document.storage_key);
  if (document.kind === 'health_attachment') {
    await client.query(
      'INSERT INTO payroll_audits (company_id, tenant_id, office_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [context.company.id, context.user.tenantId, context.officeId, context.user.userId, 'read_health_document', document.id],
    );
  }
  return { content, contentType: document.content_type };
}, (response, data) => {
  response.set('Cache-Control', 'private, no-store');
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('Content-Disposition', 'attachment');
  response.type(data.contentType).send(data.content);
}));

export default router;
