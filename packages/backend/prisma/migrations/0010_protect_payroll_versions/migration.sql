CREATE POLICY payroll_versions_approve ON payroll_versions FOR UPDATE
  USING (has_payroll_permission(tenant_id, office_id, company_id, 'read')
    AND has_payroll_permission(tenant_id, office_id, company_id, 'approve'))
  WITH CHECK (has_payroll_permission(tenant_id, office_id, company_id, 'read')
    AND has_payroll_permission(tenant_id, office_id, company_id, 'approve'));

CREATE POLICY payroll_statements_approve ON payroll_statements FOR INSERT WITH CHECK (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND has_payroll_permission(tenant_id, office_id, company_id, 'approve')
);

CREATE POLICY payroll_payments_approve ON payroll_payments FOR INSERT WITH CHECK (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND has_payroll_permission(tenant_id, office_id, company_id, 'approve')
  AND paid_on IS NULL
);

CREATE FUNCTION protect_payroll_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Approved payroll versions are immutable' USING ERRCODE = '23514';
  END IF;
  IF current_user = 'app_user' THEN
    IF NEW.approved_at IS NOT NULL THEN
      IF TG_OP = 'INSERT' OR NOT has_payroll_permission(NEW.tenant_id, NEW.office_id, NEW.company_id, 'approve')
         OR NEW.approved_by_user_id IS DISTINCT FROM current_setting('app.current_user', true)
         OR (to_jsonb(NEW) - 'approved_at' - 'approved_by_user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'approved_at' - 'approved_by_user_id') THEN
        RAISE EXCEPTION 'Invalid payroll approval' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT has_payroll_permission(NEW.tenant_id, NEW.office_id, NEW.company_id, 'write') THEN
      RAISE EXCEPTION 'Payroll write permission is required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER protect_payroll_version
  BEFORE INSERT OR UPDATE ON payroll_versions
  FOR EACH ROW EXECUTE FUNCTION protect_payroll_version();

CREATE FUNCTION protect_payroll_statement() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payroll_versions v WHERE v.approved_at IS NOT NULL
      AND v.id = NEW.version_id AND v.tenant_id = NEW.tenant_id
      AND v.office_id = NEW.office_id AND v.company_id = NEW.company_id
  ) OR (TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM payroll_versions v WHERE v.approved_at IS NOT NULL
      AND v.id = OLD.version_id AND v.tenant_id = OLD.tenant_id
      AND v.office_id = OLD.office_id AND v.company_id = OLD.company_id
  )) THEN
    RAISE EXCEPTION 'Approved payroll statements are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER protect_payroll_statement
  BEFORE INSERT OR UPDATE ON payroll_statements
  FOR EACH ROW EXECUTE FUNCTION protect_payroll_statement();
