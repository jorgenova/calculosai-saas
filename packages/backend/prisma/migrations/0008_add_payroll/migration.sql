-- CreateTable
CREATE TABLE "payroll_accesses" (
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "payroll_accesses_pkey" PRIMARY KEY ("company_id","user_id","permission")
);

-- CreateTable
CREATE TABLE "payroll_people" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date" DATE,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_engagements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "registration" TEXT,
    "category_code" INTEGER,
    "employer_id" TEXT,
    "establishment_registration" TEXT,
    "tax_allocation_code" TEXT,
    "starts_on" DATE,
    "ends_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_compensation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "engagement_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_dependents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "cpf" TEXT,
    "full_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "relationship" TEXT NOT NULL,
    "income_tax" BOOLEAN NOT NULL DEFAULT false,
    "family_allowance" BOOLEAN NOT NULL DEFAULT false,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,

    CONSTRAINT "payroll_dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_policies" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "salary_mode" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "agreement_reference" TEXT,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "competence" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_inputs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "engagement_id" TEXT NOT NULL,
    "period_id" TEXT,
    "kind" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_versions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "source_digest" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "correction_reason" TEXT,
    "approved_at" TIMESTAMPTZ,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_statements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "engagement_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "employer_charges" DECIMAL(14,2) NOT NULL,
    "items" JSONB NOT NULL,

    CONSTRAINT "payroll_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "paid_on" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2),
    "evidence_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_documents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "version_id" TEXT,
    "engagement_id" TEXT,
    "payment_id" TEXT,
    "input_id" TEXT,
    "kind" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_employers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "registration_root" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_employers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_employer_memberships" (
    "employer_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,

    CONSTRAINT "payroll_employer_memberships_pkey" PRIMARY KEY ("employer_id","company_id","tenant_id","office_id")
);

-- CreateTable
CREATE TABLE "payroll_deliveries" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "employer_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "competence" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "version_id" TEXT,
    "environment" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "layout_version" TEXT,
    "protocol" TEXT,
    "receipt" TEXT,
    "replaces_receipt" TEXT,
    "outcome" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_guides" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "document_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "official_reference" TEXT,
    "amount" DECIMAL(14,2),
    "due_on" DATE,
    "paid_on" DATE,
    "discrepancy_reason" TEXT,

    CONSTRAINT "payroll_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_audits" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "company_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "happened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_people_id_company_id_tenant_id_office_id_key" ON "payroll_people"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_people_company_id_cpf_key" ON "payroll_people"("company_id", "cpf");

-- CreateIndex
CREATE INDEX "payroll_engagements_company_id_person_id_idx" ON "payroll_engagements"("company_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_engagements_id_company_id_tenant_id_office_id_key" ON "payroll_engagements"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_engagements_company_id_registration_key" ON "payroll_engagements"("company_id", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_engagements_employer_id_registration_key" ON "payroll_engagements"("employer_id", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_compensation_engagement_id_starts_on_key" ON "payroll_compensation"("engagement_id", "starts_on");

-- CreateIndex
CREATE INDEX "payroll_dependents_person_id_starts_on_idx" ON "payroll_dependents"("person_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_policies_id_company_id_tenant_id_office_id_key" ON "payroll_policies"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_policies_company_id_starts_on_key" ON "payroll_policies"("company_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_id_company_id_tenant_id_office_id_key" ON "payroll_periods"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_company_id_competence_key" ON "payroll_periods"("company_id", "competence");

-- CreateIndex
CREATE INDEX "payroll_inputs_engagement_id_starts_on_idx" ON "payroll_inputs"("engagement_id", "starts_on");

-- CreateIndex
CREATE INDEX "payroll_inputs_period_id_idx" ON "payroll_inputs"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_inputs_id_company_id_tenant_id_office_id_key" ON "payroll_inputs"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_versions_id_company_id_tenant_id_office_id_key" ON "payroll_versions"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_versions_period_id_revision_key" ON "payroll_versions"("period_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_statements_id_company_id_tenant_id_office_id_key" ON "payroll_statements"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_statements_version_id_reference_key" ON "payroll_statements"("version_id", "reference");

-- CreateIndex
CREATE INDEX "payroll_payments_company_id_paid_on_idx" ON "payroll_payments"("company_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_id_company_id_tenant_id_office_id_key" ON "payroll_payments"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_documents_storage_key_key" ON "payroll_documents"("storage_key");

-- CreateIndex
CREATE INDEX "payroll_documents_company_id_version_id_idx" ON "payroll_documents"("company_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_documents_id_company_id_tenant_id_office_id_key" ON "payroll_documents"("id", "company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employers_id_tenant_id_office_id_key" ON "payroll_employers"("id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employers_office_id_registration_root_key" ON "payroll_employers"("office_id", "registration_root");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employer_memberships_company_id_tenant_id_office_id_key" ON "payroll_employer_memberships"("company_id", "tenant_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_deliveries_id_employer_id_tenant_id_office_id_envir_key" ON "payroll_deliveries"("id", "employer_id", "tenant_id", "office_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_deliveries_employer_id_environment_competence_key" ON "payroll_deliveries"("employer_id", "environment", "competence");

-- CreateIndex
CREATE INDEX "payroll_events_delivery_id_status_idx" ON "payroll_events"("delivery_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_events_employer_id_environment_event_key_key" ON "payroll_events"("employer_id", "environment", "event_key");

-- CreateIndex
CREATE INDEX "payroll_guides_period_id_kind_idx" ON "payroll_guides"("period_id", "kind");

-- CreateIndex
CREATE INDEX "payroll_audits_company_id_happened_at_idx" ON "payroll_audits"("company_id", "happened_at");

-- AddForeignKey
ALTER TABLE "payroll_accesses" ADD CONSTRAINT "payroll_accesses_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_accesses" ADD CONSTRAINT "payroll_accesses_user_id_tenant_id_fkey" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_people" ADD CONSTRAINT "payroll_people_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_engagements" ADD CONSTRAINT "payroll_engagements_person_id_company_id_tenant_id_office__fkey" FOREIGN KEY ("person_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_people"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_engagements" ADD CONSTRAINT "payroll_engagements_employer_id_company_id_tenant_id_offic_fkey" FOREIGN KEY ("employer_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_employer_memberships"("employer_id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_compensation" ADD CONSTRAINT "payroll_compensation_engagement_id_company_id_tenant_id_of_fkey" FOREIGN KEY ("engagement_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_engagements"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_dependents" ADD CONSTRAINT "payroll_dependents_person_id_company_id_tenant_id_office_i_fkey" FOREIGN KEY ("person_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_people"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_policies" ADD CONSTRAINT "payroll_policies_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_engagement_id_company_id_tenant_id_office_i_fkey" FOREIGN KEY ("engagement_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_engagements"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_period_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("period_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_periods"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_versions" ADD CONSTRAINT "payroll_versions_period_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("period_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_periods"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_versions" ADD CONSTRAINT "payroll_versions_policy_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("policy_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_policies"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_versions" ADD CONSTRAINT "payroll_versions_approved_by_user_id_tenant_id_fkey" FOREIGN KEY ("approved_by_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statements" ADD CONSTRAINT "payroll_statements_version_id_company_id_tenant_id_office__fkey" FOREIGN KEY ("version_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_versions"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statements" ADD CONSTRAINT "payroll_statements_engagement_id_company_id_tenant_id_offi_fkey" FOREIGN KEY ("engagement_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_engagements"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_statement_id_company_id_tenant_id_office__fkey" FOREIGN KEY ("statement_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_statements"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_version_id_company_id_tenant_id_office_i_fkey" FOREIGN KEY ("version_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_versions"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_engagement_id_company_id_tenant_id_offic_fkey" FOREIGN KEY ("engagement_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_engagements"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_payment_id_company_id_tenant_id_office_i_fkey" FOREIGN KEY ("payment_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_payments"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_documents" ADD CONSTRAINT "payroll_documents_input_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("input_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_inputs"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employers" ADD CONSTRAINT "payroll_employers_office_id_tenant_id_fkey" FOREIGN KEY ("office_id", "tenant_id") REFERENCES "offices"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employer_memberships" ADD CONSTRAINT "payroll_employer_memberships_employer_id_tenant_id_office__fkey" FOREIGN KEY ("employer_id", "tenant_id", "office_id") REFERENCES "payroll_employers"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employer_memberships" ADD CONSTRAINT "payroll_employer_memberships_company_id_tenant_id_office_i_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_deliveries" ADD CONSTRAINT "payroll_deliveries_employer_id_tenant_id_office_id_fkey" FOREIGN KEY ("employer_id", "tenant_id", "office_id") REFERENCES "payroll_employers"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_employer_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("employer_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_employer_memberships"("employer_id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_delivery_id_employer_id_tenant_id_office_id_fkey" FOREIGN KEY ("delivery_id", "employer_id", "tenant_id", "office_id", "environment") REFERENCES "payroll_deliveries"("id", "employer_id", "tenant_id", "office_id", "environment") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_version_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("version_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_versions"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_guides" ADD CONSTRAINT "payroll_guides_period_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("period_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_periods"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_guides" ADD CONSTRAINT "payroll_guides_document_id_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("document_id", "company_id", "tenant_id", "office_id") REFERENCES "payroll_documents"("id", "company_id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audits" ADD CONSTRAINT "payroll_audits_company_id_tenant_id_office_id_fkey" FOREIGN KEY ("company_id", "tenant_id", "office_id") REFERENCES "companies"("id", "tenant_id", "office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audits" ADD CONSTRAINT "payroll_audits_actor_id_tenant_id_fkey" FOREIGN KEY ("actor_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants that Prisma does not express.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE payroll_people
  ADD CONSTRAINT payroll_people_normalized_cpf CHECK (cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT payroll_people_details_object CHECK (jsonb_typeof(details) = 'object');

ALTER TABLE payroll_engagements
  ADD CONSTRAINT payroll_engagements_kind CHECK (kind IN ('employee', 'partner')),
  ADD CONSTRAINT payroll_engagements_status CHECK (status IN ('draft', 'active', 'ended')),
  ADD CONSTRAINT payroll_engagements_dates CHECK (ends_on IS NULL OR (starts_on IS NOT NULL AND ends_on >= starts_on)),
  ADD CONSTRAINT payroll_engagements_active_fields CHECK (
    status = 'draft' OR (
      starts_on IS NOT NULL AND category_code IS NOT NULL
      AND (kind <> 'employee' OR registration IS NOT NULL)
      AND (status <> 'ended' OR ends_on IS NOT NULL)
    )
  ),
  ADD CONSTRAINT payroll_engagements_details_object CHECK (jsonb_typeof(details) = 'object');

ALTER TABLE payroll_compensation
  ADD CONSTRAINT payroll_compensation_amount CHECK (amount >= 0),
  ADD CONSTRAINT payroll_compensation_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  ADD CONSTRAINT payroll_compensation_no_overlap
    EXCLUDE USING gist (engagement_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);

ALTER TABLE payroll_dependents
  ADD CONSTRAINT payroll_dependents_normalized_cpf CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT payroll_dependents_dates CHECK (ends_on IS NULL OR ends_on >= starts_on);

ALTER TABLE payroll_policies
  ADD CONSTRAINT payroll_policies_mode CHECK (salary_mode IN ('monthly', 'monthly_advance', 'semimonthly')),
  ADD CONSTRAINT payroll_policies_semimonthly_reference CHECK (
    salary_mode <> 'semimonthly' OR nullif(btrim(agreement_reference), '') IS NOT NULL
  ),
  ADD CONSTRAINT payroll_policies_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  ADD CONSTRAINT payroll_policies_rules_object CHECK (jsonb_typeof(rules) = 'object'),
  ADD CONSTRAINT payroll_policies_no_overlap
    EXCLUDE USING gist (company_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&);

ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_month_start CHECK (extract(day FROM competence) = 1);

ALTER TABLE payroll_inputs
  ADD CONSTRAINT payroll_inputs_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  ADD CONSTRAINT payroll_inputs_value_object CHECK (jsonb_typeof(value) = 'object');

ALTER TABLE payroll_versions
  ADD CONSTRAINT payroll_versions_revision CHECK (revision > 0),
  ADD CONSTRAINT payroll_versions_approval CHECK ((approved_at IS NULL) = (approved_by_user_id IS NULL)),
  ADD CONSTRAINT payroll_versions_correction CHECK (revision = 1 OR nullif(btrim(correction_reason), '') IS NOT NULL);

ALTER TABLE payroll_payments
  ADD CONSTRAINT payroll_payments_actual_fields CHECK (
    (paid_on IS NULL) = (paid_amount IS NULL) AND (paid_on IS NULL) = (evidence_reference IS NULL)
  ),
  ADD CONSTRAINT payroll_payments_amount CHECK (amount >= 0 AND (paid_amount IS NULL OR paid_amount >= 0));

ALTER TABLE payroll_documents
  ADD CONSTRAINT payroll_documents_health_input CHECK (kind <> 'health_attachment' OR input_id IS NOT NULL);

ALTER TABLE payroll_employers
  ADD CONSTRAINT payroll_employers_cnpj_root CHECK (registration_root ~ '^[0-9A-Z]{8}$');

ALTER TABLE payroll_deliveries
  ADD CONSTRAINT payroll_deliveries_environment CHECK (environment IN ('restricted', 'production')),
  ADD CONSTRAINT payroll_deliveries_mode CHECK (mode IN ('external', 'integrated')),
  ADD CONSTRAINT payroll_deliveries_month_start CHECK (extract(day FROM competence) = 1);

ALTER TABLE payroll_events
  ADD CONSTRAINT payroll_events_environment CHECK (environment IN ('restricted', 'production')),
  ADD CONSTRAINT payroll_events_origin CHECK (origin IN ('external', 'integrated')),
  ADD CONSTRAINT payroll_events_type CHECK (event_type ~ '^S-[0-9]{4}$'),
  ADD CONSTRAINT payroll_events_status CHECK (
    status IN ('prepared', 'queued', 'sent', 'indeterminate', 'accepted', 'rejected', 'reported')
  ),
  ADD CONSTRAINT payroll_events_accepted_receipt CHECK (status <> 'accepted' OR receipt IS NOT NULL);

ALTER TABLE payroll_guides
  ADD CONSTRAINT payroll_guides_kind CHECK (kind IN ('dctfweb', 'darf', 'gfd')),
  ADD CONSTRAINT payroll_guides_status CHECK (status IN ('pending', 'declared', 'issued', 'paid', 'not_applicable')),
  ADD CONSTRAINT payroll_guides_paid_date CHECK ((status = 'paid') = (paid_on IS NOT NULL));

ALTER TABLE payroll_accesses
  ADD CONSTRAINT payroll_accesses_permission CHECK (permission IN ('read', 'write', 'approve', 'transmit', 'health_documents'));

CREATE FUNCTION payroll_office_in_context(target_tenant TEXT, target_office TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT target_tenant = current_setting('app.current_tenant', true)
    AND target_office = current_setting('app.current_office', true)
    AND can_access_office(target_tenant, current_setting('app.current_user', true), target_office)
$function$;

CREATE FUNCTION payroll_company_in_context(target_tenant TEXT, target_office TEXT, target_company TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT payroll_office_in_context(target_tenant, target_office)
    AND target_company = current_setting('app.current_company', true)
$function$;

ALTER TABLE payroll_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_accesses_read ON payroll_accesses FOR SELECT USING (
  payroll_company_in_context(tenant_id, office_id, company_id)
  AND (current_setting('app.current_role', true) = 'owner' OR user_id = current_setting('app.current_user', true))
);
CREATE POLICY payroll_accesses_manage ON payroll_accesses FOR ALL USING (
  payroll_company_in_context(tenant_id, office_id, company_id)
  AND current_setting('app.current_role', true) = 'owner'
) WITH CHECK (
  payroll_company_in_context(tenant_id, office_id, company_id)
  AND current_setting('app.current_role', true) = 'owner'
);
GRANT SELECT, INSERT, DELETE ON payroll_accesses TO app_user;

CREATE FUNCTION has_payroll_permission(target_tenant TEXT, target_office TEXT, target_company TEXT, permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT payroll_company_in_context(target_tenant, target_office, target_company)
    AND (
      current_setting('app.current_role', true) = 'owner'
      OR EXISTS (
        SELECT 1
        FROM payroll_accesses
        WHERE tenant_id = target_tenant
          AND office_id = target_office
          AND company_id = target_company
          AND user_id = current_setting('app.current_user', true)
          AND permission = permission_name
      )
    )
$function$;

REVOKE EXECUTE ON FUNCTION payroll_office_in_context(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION payroll_company_in_context(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_payroll_permission(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_office_in_context(TEXT, TEXT),
  payroll_company_in_context(TEXT, TEXT, TEXT), has_payroll_permission(TEXT, TEXT, TEXT, TEXT) TO app_user;

DO $payroll_security$
DECLARE
  relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'payroll_people', 'payroll_engagements', 'payroll_compensation',
    'payroll_dependents', 'payroll_policies', 'payroll_periods', 'payroll_inputs',
    'payroll_versions', 'payroll_statements', 'payroll_payments', 'payroll_guides'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY payroll_read ON %I FOR SELECT USING (has_payroll_permission(tenant_id, office_id, company_id, %L))',
      relation_name, 'read'
    );
    EXECUTE format(
      'CREATE POLICY payroll_write ON %I FOR ALL USING (has_payroll_permission(tenant_id, office_id, company_id, %L) AND has_payroll_permission(tenant_id, office_id, company_id, %L)) WITH CHECK (has_payroll_permission(tenant_id, office_id, company_id, %L) AND has_payroll_permission(tenant_id, office_id, company_id, %L))',
      relation_name, 'read', 'write', 'read', 'write'
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', relation_name);
  END LOOP;
END
$payroll_security$;

ALTER TABLE payroll_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_documents_read ON payroll_documents FOR SELECT USING (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND (kind <> 'health_attachment' OR has_payroll_permission(tenant_id, office_id, company_id, 'health_documents'))
);
CREATE POLICY payroll_documents_insert ON payroll_documents FOR INSERT WITH CHECK (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND has_payroll_permission(tenant_id, office_id, company_id, 'write')
  AND (kind <> 'health_attachment' OR has_payroll_permission(tenant_id, office_id, company_id, 'health_documents'))
);
GRANT SELECT, INSERT ON payroll_documents TO app_user;

ALTER TABLE payroll_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_audits FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_audits_read ON payroll_audits FOR SELECT USING (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND (action <> 'read_health_document' OR has_payroll_permission(tenant_id, office_id, company_id, 'health_documents'))
);
CREATE POLICY payroll_audits_append ON payroll_audits FOR INSERT WITH CHECK (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND actor_id = current_setting('app.current_user', true)
  AND (action <> 'read_health_document' OR has_payroll_permission(tenant_id, office_id, company_id, 'health_documents'))
);
GRANT SELECT, INSERT ON payroll_audits TO app_user;

ALTER TABLE payroll_employer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employer_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_memberships_read ON payroll_employer_memberships FOR SELECT USING (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
);
CREATE POLICY payroll_memberships_manage ON payroll_employer_memberships FOR INSERT WITH CHECK (
  payroll_company_in_context(tenant_id, office_id, company_id)
  AND current_setting('app.current_role', true) = 'owner'
);
GRANT SELECT, INSERT ON payroll_employer_memberships TO app_user;

ALTER TABLE payroll_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employers FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_employers_read ON payroll_employers FOR SELECT USING (
  payroll_office_in_context(tenant_id, office_id)
  AND (
    current_setting('app.current_role', true) = 'owner'
    OR EXISTS (SELECT 1 FROM payroll_employer_memberships WHERE employer_id = payroll_employers.id)
  )
);
CREATE POLICY payroll_employers_manage ON payroll_employers FOR INSERT WITH CHECK (
  payroll_office_in_context(tenant_id, office_id) AND current_setting('app.current_role', true) = 'owner'
);
GRANT SELECT, INSERT ON payroll_employers TO app_user;

ALTER TABLE payroll_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_deliveries_read ON payroll_deliveries FOR SELECT USING (
  payroll_office_in_context(tenant_id, office_id)
  AND EXISTS (SELECT 1 FROM payroll_employer_memberships WHERE employer_id = payroll_deliveries.employer_id)
);
CREATE POLICY payroll_deliveries_manage ON payroll_deliveries FOR ALL USING (
  payroll_office_in_context(tenant_id, office_id)
  AND EXISTS (
    SELECT 1 FROM payroll_employer_memberships AS membership
    WHERE membership.employer_id = payroll_deliveries.employer_id
      AND has_payroll_permission(membership.tenant_id, membership.office_id, membership.company_id, 'transmit')
  )
);
GRANT SELECT, INSERT, UPDATE ON payroll_deliveries TO app_user;

ALTER TABLE payroll_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_events FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_events_read ON payroll_events FOR SELECT USING (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
);
CREATE POLICY payroll_events_manage ON payroll_events FOR ALL USING (
  has_payroll_permission(tenant_id, office_id, company_id, 'read')
  AND has_payroll_permission(tenant_id, office_id, company_id, 'transmit')
);
GRANT SELECT, INSERT, UPDATE ON payroll_events TO app_user;

-- Column descriptions used in the data dictionary.
COMMENT ON TABLE payroll_accesses IS 'Permissões concedidas a usuários para trabalhar em rotinas ou documentos de folha de uma empresa.';
COMMENT ON COLUMN payroll_accesses.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_accesses.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_accesses.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_accesses.user_id IS 'Identificador do usuário a quem foi concedida a permissão específica para consultar ou executar a operação dentro da empresa.';
COMMENT ON COLUMN payroll_accesses.permission IS 'Permissão específica no módulo de folha, abrangendo leitura, edição, aprovação, transmissão ou acesso a documentos de saúde.';
COMMENT ON TABLE payroll_people IS 'Identificação da pessoa física dentro da empresa. Empregos e atuações remuneradas usam a mesma pessoa.';
COMMENT ON COLUMN payroll_people.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_people.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_people.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_people.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_people.cpf IS 'CPF normalizado com onze dígitos, usado para reconhecer a pessoa física e relacionar dados exigidos no cálculo e na escrituração.';
COMMENT ON COLUMN payroll_people.full_name IS 'Nome completo da pessoa física ou do dependente, conforme o cadastro de referência usado no módulo e nos eventos aplicáveis.';
COMMENT ON COLUMN payroll_people.birth_date IS 'Data civil de nascimento utilizada pelas validações cadastrais e na aplicação das regras que dependem da idade da pessoa.';
COMMENT ON COLUMN payroll_people.details IS 'Informações complementares validadas segundo o formulário e o leiaute do evento aplicável para a pessoa ou o tipo de vínculo.';
COMMENT ON COLUMN payroll_people.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON COLUMN payroll_people.updated_at IS 'Data e hora da última alteração do registro, utilizada para acompanhar o estado e a atualização dos dados da folha.';
COMMENT ON TABLE payroll_engagements IS 'Vínculos de emprego ou atuação de sócio, com dados cadastrais e contratuais da categoria.';
COMMENT ON COLUMN payroll_engagements.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_engagements.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_engagements.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_engagements.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_engagements.person_id IS 'Identificador da pessoa física da mesma empresa, relacionado pelo conjunto de chaves que preserva o contexto do escritório.';
COMMENT ON COLUMN payroll_engagements.kind IS 'Classificação funcional do registro que identifica o tipo de vínculo, lançamento, demonstrativo, documento ou obrigação aplicável.';
COMMENT ON COLUMN payroll_engagements.registration IS 'Matrícula do vínculo dentro do empregador, usada na identificação contratual e na associação com os eventos oficiais aplicáveis.';
COMMENT ON COLUMN payroll_engagements.category_code IS 'Código da categoria do trabalhador na tabela oficial do eSocial, usado para validar os dados e determinar eventos aplicáveis.';
COMMENT ON COLUMN payroll_engagements.employer_id IS 'Identificador do declarante do eSocial no escritório, usado para agrupar empresas e seus eventos sob a inscrição oficial correspondente.';
COMMENT ON COLUMN payroll_engagements.establishment_registration IS 'Inscrição do estabelecimento ao qual o trabalhador está vinculado para fins de cálculo e identificação na escrituração oficial.';
COMMENT ON COLUMN payroll_engagements.tax_allocation_code IS 'Código da lotação tributária atribuído ao trabalhador e usado para declarar a classificação da remuneração perante o eSocial.';
COMMENT ON COLUMN payroll_engagements.starts_on IS 'Data civil inicial do intervalo, usada para selecionar o registro durante a vigência ou apurar a ocorrência na competência pertinente.';
COMMENT ON COLUMN payroll_engagements.ends_on IS 'Data civil final do intervalo, mantida para preservar o histórico e identificar vigências ou ocorrências que atravessam competências.';
COMMENT ON COLUMN payroll_engagements.status IS 'Situação do registro em seu fluxo correspondente, consultada para distinguir cadastros, transmissões e obrigações nos estados previstos.';
COMMENT ON COLUMN payroll_engagements.details IS 'Informações complementares validadas segundo o formulário e o leiaute do evento aplicável para a pessoa ou o tipo de vínculo.';
COMMENT ON COLUMN payroll_engagements.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON COLUMN payroll_engagements.updated_at IS 'Data e hora da última alteração do registro, utilizada para acompanhar o estado e a atualização dos dados da folha.';
COMMENT ON TABLE payroll_compensation IS 'Histórico dos valores brutos e unidades de remuneração de cada vínculo.';
COMMENT ON COLUMN payroll_compensation.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_compensation.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_compensation.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_compensation.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_compensation.engagement_id IS 'Identificador de um vínculo da mesma empresa, usado para relacionar salários, pró-labores, ocorrências e documentos ao titular correto.';
COMMENT ON COLUMN payroll_compensation.amount IS 'Valor monetário em reais registrado com duas casas decimais para remuneração, desembolso previsto ou guia, conforme o tipo do registro.';
COMMENT ON COLUMN payroll_compensation.unit IS 'Unidade salarial ou remuneratória da parte fixa, usada para interpretar o valor vigente durante o cálculo por competência.';
COMMENT ON COLUMN payroll_compensation.starts_on IS 'Data civil inicial do intervalo, usada para selecionar o registro durante a vigência ou apurar a ocorrência na competência pertinente.';
COMMENT ON COLUMN payroll_compensation.ends_on IS 'Data civil final do intervalo, mantida para preservar o histórico e identificar vigências ou ocorrências que atravessam competências.';
COMMENT ON COLUMN payroll_compensation.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_dependents IS 'Dependentes com vigência para IRRF e salário-família, quando aplicáveis.';
COMMENT ON COLUMN payroll_dependents.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_dependents.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_dependents.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_dependents.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_dependents.person_id IS 'Identificador da pessoa física da mesma empresa, relacionado pelo conjunto de chaves que preserva o contexto do escritório.';
COMMENT ON COLUMN payroll_dependents.cpf IS 'CPF normalizado com onze dígitos, usado para reconhecer a pessoa física e relacionar dados exigidos no cálculo e na escrituração.';
COMMENT ON COLUMN payroll_dependents.full_name IS 'Nome completo da pessoa física ou do dependente, conforme o cadastro de referência usado no módulo e nos eventos aplicáveis.';
COMMENT ON COLUMN payroll_dependents.birth_date IS 'Data civil de nascimento utilizada pelas validações cadastrais e na aplicação das regras que dependem da idade da pessoa.';
COMMENT ON COLUMN payroll_dependents.relationship IS 'Classificação do parentesco ou vínculo familiar que identifica a relação entre o dependente informado e o titular do cadastro.';
COMMENT ON COLUMN payroll_dependents.income_tax IS 'Indica se o dependente pode ser considerado para dedução do imposto de renda na fonte conforme os dados e a vigência cadastrados.';
COMMENT ON COLUMN payroll_dependents.family_allowance IS 'Indica se o dependente integra as regras de salário-família, sujeito aos demais requisitos aplicáveis durante a apuração.';
COMMENT ON COLUMN payroll_dependents.starts_on IS 'Data civil inicial do intervalo, usada para selecionar o registro durante a vigência ou apurar a ocorrência na competência pertinente.';
COMMENT ON COLUMN payroll_dependents.ends_on IS 'Data civil final do intervalo, mantida para preservar o histórico e identificar vigências ou ocorrências que atravessam competências.';
COMMENT ON TABLE payroll_policies IS 'Histórico das regras salariais, de adiantamento e de pagamento de pró-labore.';
COMMENT ON COLUMN payroll_policies.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_policies.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_policies.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_policies.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_policies.salary_mode IS 'Modalidade de apuração do salário da empresa, definida como mensal, mensal com adiantamento ou duas apurações quinzenais.';
COMMENT ON COLUMN payroll_policies.starts_on IS 'Data civil inicial do intervalo, usada para selecionar o registro durante a vigência ou apurar a ocorrência na competência pertinente.';
COMMENT ON COLUMN payroll_policies.ends_on IS 'Data civil final do intervalo, mantida para preservar o histórico e identificar vigências ou ocorrências que atravessam competências.';
COMMENT ON COLUMN payroll_policies.agreement_reference IS 'Referência à convenção, ao acordo ou ao contrato aplicável à programação salarial adotada na vigência da política cadastrada.';
COMMENT ON COLUMN payroll_policies.rules IS 'Parâmetros de calendário, vencimentos, adiantamento e pagamento de pró-labore usados para preparar a programação de desembolsos.';
COMMENT ON COLUMN payroll_policies.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_periods IS 'Competências mensais de folha registradas no contexto de uma empresa.';
COMMENT ON COLUMN payroll_periods.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_periods.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_periods.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_periods.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_periods.competence IS 'Primeiro dia civil do mês de apuração, usado como chave de competência mensal para a folha ou para a entrega oficial.';
COMMENT ON COLUMN payroll_periods.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_inputs IS 'Ocorrências e lançamentos usados no cálculo, com datas de referência e vínculo.';
COMMENT ON COLUMN payroll_inputs.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_inputs.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_inputs.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_inputs.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_inputs.engagement_id IS 'Identificador de um vínculo da mesma empresa, usado para relacionar salários, pró-labores, ocorrências e documentos ao titular correto.';
COMMENT ON COLUMN payroll_inputs.period_id IS 'Identificador da competência da mesma empresa, usado para agrupar os registros de apuração e suas obrigações associadas.';
COMMENT ON COLUMN payroll_inputs.kind IS 'Classificação funcional do registro que identifica o tipo de vínculo, lançamento, demonstrativo, documento ou obrigação aplicável.';
COMMENT ON COLUMN payroll_inputs.starts_on IS 'Data civil inicial do intervalo, usada para selecionar o registro durante a vigência ou apurar a ocorrência na competência pertinente.';
COMMENT ON COLUMN payroll_inputs.ends_on IS 'Data civil final do intervalo, mantida para preservar o histórico e identificar vigências ou ocorrências que atravessam competências.';
COMMENT ON COLUMN payroll_inputs.value IS 'Dados estruturados da ocorrência ou do lançamento, contendo quantidade, valor ou informações operacionais conforme a sua classificação.';
COMMENT ON COLUMN payroll_inputs.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_versions IS 'Versões calculadas da competência com entradas, resultados e evidência de aprovação.';
COMMENT ON COLUMN payroll_versions.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_versions.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_versions.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_versions.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_versions.period_id IS 'Identificador da competência da mesma empresa, usado para agrupar os registros de apuração e suas obrigações associadas.';
COMMENT ON COLUMN payroll_versions.policy_id IS 'Identificador da versão da política de pagamento utilizada pelo cálculo para permitir recuperar as regras da competência aprovada.';
COMMENT ON COLUMN payroll_versions.revision IS 'Número sequencial da versão calculada para a competência, usado para identificar rascunhos, aprovações e correções posteriores.';
COMMENT ON COLUMN payroll_versions.source_digest IS 'Resumo de integridade das fontes selecionadas para o cálculo, usado para verificar se os dados ainda correspondem à versão aprovada.';
COMMENT ON COLUMN payroll_versions.inputs IS 'Cópia dos parâmetros e dos dados de entrada da apuração, preservada para reproduzir a memória de cálculo de uma versão da folha.';
COMMENT ON COLUMN payroll_versions.totals IS 'Resultado consolidado da versão calculada, usado na revisão e para comparar proventos, descontos, líquido e encargos da competência.';
COMMENT ON COLUMN payroll_versions.correction_reason IS 'Motivo registrado pelo usuário ao gerar uma versão de correção, preservado para explicar a revisão dos valores ou eventos relacionados.';
COMMENT ON COLUMN payroll_versions.approved_at IS 'Data e hora da aprovação da apuração, preenchida junto à referência do responsável para distinguir a versão fechada dos rascunhos.';
COMMENT ON COLUMN payroll_versions.approved_by_user_id IS 'Identificador do usuário da conta que aprovou este resultado, associado à data da decisão para tornar o fechamento rastreável.';
COMMENT ON COLUMN payroll_versions.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_statements IS 'Demonstrativos por vínculo com rubricas, bases, valores líquidos e encargos.';
COMMENT ON COLUMN payroll_statements.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_statements.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_statements.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_statements.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_statements.version_id IS 'Identificador da versão da folha à qual o registro está associado, validado no escopo da empresa para preservar a origem do resultado.';
COMMENT ON COLUMN payroll_statements.engagement_id IS 'Identificador de um vínculo da mesma empresa, usado para relacionar salários, pró-labores, ocorrências e documentos ao titular correto.';
COMMENT ON COLUMN payroll_statements.reference IS 'Identificador estável do demonstrativo dentro da versão, utilizado para vincular os pagamentos e preparar a escrituração aplicável.';
COMMENT ON COLUMN payroll_statements.kind IS 'Classificação funcional do registro que identifica o tipo de vínculo, lançamento, demonstrativo, documento ou obrigação aplicável.';
COMMENT ON COLUMN payroll_statements.gross IS 'Total de proventos brutos em reais apurado para o demonstrativo antes de descontar retenções e demais verbas dedutíveis.';
COMMENT ON COLUMN payroll_statements.deductions IS 'Total dos descontos que afetam o líquido do demonstrativo, conforme os valores detalhados na memória de cálculo por rubrica.';
COMMENT ON COLUMN payroll_statements.net IS 'Resultado líquido do demonstrativo conforme os proventos e descontos apurados, utilizado para conciliar os desembolsos efetivos.';
COMMENT ON COLUMN payroll_statements.employer_charges IS 'Valor dos encargos atribuídos ao empregador, apresentado separadamente para conferência das bases oficiais e do custo da folha.';
COMMENT ON COLUMN payroll_statements.items IS 'Rubricas calculadas com origem, incidências, quantidades, valores e parâmetros usados na memória de cálculo do demonstrativo.';
COMMENT ON TABLE payroll_payments IS 'Desembolsos previstos e efetivos conciliados com demonstrativos da folha.';
COMMENT ON COLUMN payroll_payments.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_payments.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_payments.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_payments.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_payments.statement_id IS 'Identificador do demonstrativo que deu origem ao desembolso, validado no contexto da mesma empresa e usado na escrituração.';
COMMENT ON COLUMN payroll_payments.due_on IS 'Data civil de vencimento prevista para o desembolso ou para a guia oficial, utilizada no acompanhamento de obrigações pendentes.';
COMMENT ON COLUMN payroll_payments.paid_on IS 'Data civil do desembolso ou recolhimento efetivo, usada na conciliação e, quando aplicável, na competência do evento de pagamento.';
COMMENT ON COLUMN payroll_payments.amount IS 'Valor monetário em reais registrado com duas casas decimais para remuneração, desembolso previsto ou guia, conforme o tipo do registro.';
COMMENT ON COLUMN payroll_payments.paid_amount IS 'Valor em reais efetivamente desembolsado, registrado com a data e a evidência para conciliar o pagamento ao demonstrativo.';
COMMENT ON COLUMN payroll_payments.evidence_reference IS 'Referência ao comprovante ou à evidência apresentada para sustentar o registro da data e do valor do desembolso efetivo.';
COMMENT ON COLUMN payroll_payments.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_documents IS 'Metadados e referências privadas para documentos da folha, de férias e anexos.';
COMMENT ON COLUMN payroll_documents.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_documents.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_documents.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_documents.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_documents.version_id IS 'Identificador da versão da folha à qual o registro está associado, validado no escopo da empresa para preservar a origem do resultado.';
COMMENT ON COLUMN payroll_documents.engagement_id IS 'Identificador de um vínculo da mesma empresa, usado para relacionar salários, pró-labores, ocorrências e documentos ao titular correto.';
COMMENT ON COLUMN payroll_documents.payment_id IS 'Identificador do pagamento associado a um documento, permitindo localizar o recibo e validar seu pertencimento à mesma empresa.';
COMMENT ON COLUMN payroll_documents.input_id IS 'Identificador da ocorrência ou do lançamento a que se refere o documento, utilizado para vincular a evidência sem expor seu conteúdo.';
COMMENT ON COLUMN payroll_documents.kind IS 'Classificação funcional do registro que identifica o tipo de vínculo, lançamento, demonstrativo, documento ou obrigação aplicável.';
COMMENT ON COLUMN payroll_documents.storage_key IS 'Identificador privado do conteúdo armazenado, resolvido pelo servidor após verificar a permissão de acesso ao documento na empresa.';
COMMENT ON COLUMN payroll_documents.content_type IS 'Tipo de mídia do documento armazenado, identificado e validado no processamento para permitir leitura apropriada do conteúdo.';
COMMENT ON COLUMN payroll_documents.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_employers IS 'Declarantes do eSocial agrupados pela inscrição raiz dentro do escritório.';
COMMENT ON COLUMN payroll_employers.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_employers.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_employers.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_employers.registration_root IS 'Raiz normalizada da inscrição CNPJ do declarante, usada para centralizar a entrega dos estabelecimentos no mesmo escritório.';
COMMENT ON COLUMN payroll_employers.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_employer_memberships IS 'Vínculos de empresas atendidas com o declarante que consolida sua entrega oficial.';
COMMENT ON COLUMN payroll_employer_memberships.employer_id IS 'Identificador do declarante do eSocial no escritório, usado para agrupar empresas e seus eventos sob a inscrição oficial correspondente.';
COMMENT ON COLUMN payroll_employer_memberships.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_employer_memberships.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_employer_memberships.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON TABLE payroll_deliveries IS 'Controle do responsável pela entrega por declarante, competência e ambiente oficial.';
COMMENT ON COLUMN payroll_deliveries.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_deliveries.employer_id IS 'Identificador do declarante do eSocial no escritório, usado para agrupar empresas e seus eventos sob a inscrição oficial correspondente.';
COMMENT ON COLUMN payroll_deliveries.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_deliveries.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_deliveries.environment IS 'Ambiente oficial do eSocial em que a entrega ou o evento é processado, diferenciando Produção Restrita do ambiente de produção.';
COMMENT ON COLUMN payroll_deliveries.competence IS 'Primeiro dia civil do mês de apuração, usado como chave de competência mensal para a folha ou para a entrega oficial.';
COMMENT ON COLUMN payroll_deliveries.mode IS 'Responsável pela entrega da competência, indicando conferência com transmissão externa ou envio integrado pelo Superior Contábil.';
COMMENT ON COLUMN payroll_deliveries.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON TABLE payroll_events IS 'Eventos do eSocial com identidade oficial, origem, processamento e recibos.';
COMMENT ON COLUMN payroll_events.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_events.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_events.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_events.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_events.employer_id IS 'Identificador do declarante do eSocial no escritório, usado para agrupar empresas e seus eventos sob a inscrição oficial correspondente.';
COMMENT ON COLUMN payroll_events.delivery_id IS 'Identificador da entrega periódica do mesmo declarante e ambiente, utilizado para acompanhar a competência dos eventos vinculados.';
COMMENT ON COLUMN payroll_events.version_id IS 'Identificador da versão da folha à qual o registro está associado, validado no escopo da empresa para preservar a origem do resultado.';
COMMENT ON COLUMN payroll_events.environment IS 'Ambiente oficial do eSocial em que a entrega ou o evento é processado, diferenciando Produção Restrita do ambiente de produção.';
COMMENT ON COLUMN payroll_events.event_type IS 'Código do tipo de evento no leiaute oficial do eSocial, usado para validar o conteúdo e interpretar o seu retorno de processamento.';
COMMENT ON COLUMN payroll_events.event_key IS 'Identificador estável do evento no declarante e ambiente, usado para conciliar tentativas, retornos e evidências sem duplicidade.';
COMMENT ON COLUMN payroll_events.origin IS 'Origem do registro de entrega, permitindo distinguir os eventos processados pela integração dos dados informados pelo escritório.';
COMMENT ON COLUMN payroll_events.status IS 'Situação do registro em seu fluxo correspondente, consultada para distinguir cadastros, transmissões e obrigações nos estados previstos.';
COMMENT ON COLUMN payroll_events.layout_version IS 'Versão do leiaute oficial usada para construir e validar o evento antes do envio e para interpretar o conteúdo preservado.';
COMMENT ON COLUMN payroll_events.protocol IS 'Número de protocolo retornado ao receber um lote, empregado nas consultas de processamento e na recuperação de resultados pendentes.';
COMMENT ON COLUMN payroll_events.receipt IS 'Número do recibo oficial do evento aceito, necessário para comprovar a entrega e para vincular retificações quando aplicáveis.';
COMMENT ON COLUMN payroll_events.replaces_receipt IS 'Número do recibo oficial da entrega anterior a que se refere uma retificação, preservando a relação entre eventos sucessivos.';
COMMENT ON COLUMN payroll_events.outcome IS 'Resultado estruturado com ocorrências de validação ou totalizadores oficiais necessários para conferir a entrega do evento.';
COMMENT ON COLUMN payroll_events.created_at IS 'Data e hora em que o registro foi incluído, usadas para recuperar a ordem das operações e apoiar a trilha de auditoria da folha.';
COMMENT ON COLUMN payroll_events.updated_at IS 'Data e hora da última alteração do registro, utilizada para acompanhar o estado e a atualização dos dados da folha.';
COMMENT ON TABLE payroll_guides IS 'Acompanhamento das declarações, guias e quitações conciliadas com a competência.';
COMMENT ON COLUMN payroll_guides.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_guides.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_guides.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_guides.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_guides.period_id IS 'Identificador da competência da mesma empresa, usado para agrupar os registros de apuração e suas obrigações associadas.';
COMMENT ON COLUMN payroll_guides.document_id IS 'Identificador do documento oficial associado ao registro da guia, validado com a empresa e usado para localizar sua evidência.';
COMMENT ON COLUMN payroll_guides.kind IS 'Classificação funcional do registro que identifica o tipo de vínculo, lançamento, demonstrativo, documento ou obrigação aplicável.';
COMMENT ON COLUMN payroll_guides.status IS 'Situação do registro em seu fluxo correspondente, consultada para distinguir cadastros, transmissões e obrigações nos estados previstos.';
COMMENT ON COLUMN payroll_guides.official_reference IS 'Referência oficial informada no portal correspondente, utilizada para localizar a declaração ou a guia durante a conciliação.';
COMMENT ON COLUMN payroll_guides.amount IS 'Valor monetário em reais registrado com duas casas decimais para remuneração, desembolso previsto ou guia, conforme o tipo do registro.';
COMMENT ON COLUMN payroll_guides.due_on IS 'Data civil de vencimento prevista para o desembolso ou para a guia oficial, utilizada no acompanhamento de obrigações pendentes.';
COMMENT ON COLUMN payroll_guides.paid_on IS 'Data civil do desembolso ou recolhimento efetivo, usada na conciliação e, quando aplicável, na competência do evento de pagamento.';
COMMENT ON COLUMN payroll_guides.discrepancy_reason IS 'Justificativa registrada pelo escritório quando o valor conciliado difere da apuração local da competência ou obrigação.';
COMMENT ON TABLE payroll_audits IS 'Trilha de autoria e data de operações relevantes, incluindo consultas a anexos médicos.';
COMMENT ON COLUMN payroll_audits.id IS 'Identificador técnico estável gerado pelo banco para relacionar o registro e comprovar a ligação entre operações do mesmo contexto.';
COMMENT ON COLUMN payroll_audits.company_id IS 'Identificador da empresa atendida à qual pertence o registro, validado com o escritório e a conta nas referências compostas e nos controles de acesso.';
COMMENT ON COLUMN payroll_audits.tenant_id IS 'Identificador da conta contratante usado nas chaves compostas e nas políticas de acesso para manter o isolamento entre contas distintas.';
COMMENT ON COLUMN payroll_audits.office_id IS 'Identificador do escritório ativo ao qual pertence o registro, validado com a conta contratante nas relações de folha e nas regras de acesso.';
COMMENT ON COLUMN payroll_audits.actor_id IS 'Identificador do usuário que executou a ação auditada, usado para registrar autoria e restringir atribuições a contas distintas.';
COMMENT ON COLUMN payroll_audits.action IS 'Tipo de operação auditada, diferenciando alterações e consultas a documentos que exigem registro da identidade do responsável.';
COMMENT ON COLUMN payroll_audits.target_id IS 'Identificador técnico do recurso afetado pela operação registrada, utilizado para localizar a ação sem armazenar dados pessoais no evento.';
COMMENT ON COLUMN payroll_audits.happened_at IS 'Data e hora em que a operação auditada ocorreu, permitindo ordenar as ações e localizar o registro de acesso ao recurso.';
