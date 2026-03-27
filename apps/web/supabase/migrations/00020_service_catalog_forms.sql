-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00020: SERVICE CATALOG & FORMS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates service catalog, forms, sections, questions,
--              submissions, and form destinations.
-- Depends on: 00010_workflows.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: service_catalogs
-- ---------------------------------------------------------------

CREATE TABLE service_catalogs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  icon            text,
  sort_order      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE service_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalogs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_service_catalogs_tenant ON service_catalogs (tenant_id);
CREATE INDEX idx_service_catalogs_tenant_active ON service_catalogs (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_catalogs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY service_catalogs_select ON service_catalogs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY service_catalogs_insert ON service_catalogs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY service_catalogs_update ON service_catalogs FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY service_catalogs_delete ON service_catalogs FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: forms
-- ---------------------------------------------------------------

CREATE TABLE forms (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_catalog_id  uuid REFERENCES service_catalogs(id) ON DELETE SET NULL,
  name                text NOT NULL,
  description         text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_forms_tenant ON forms (tenant_id);
CREATE INDEX idx_forms_tenant_catalog ON forms (tenant_id, service_catalog_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY forms_select ON forms FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY forms_insert ON forms FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY forms_update ON forms FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY forms_delete ON forms FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: form_sections
-- ---------------------------------------------------------------

CREATE TABLE form_sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title           text,
  description     text,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_sections FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_form_sections_tenant ON form_sections (tenant_id);
CREATE INDEX idx_form_sections_form ON form_sections (form_id);

-- Policies
CREATE POLICY form_sections_select ON form_sections FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_sections_insert ON form_sections FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY form_sections_update ON form_sections FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_sections_delete ON form_sections FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: form_questions
-- ---------------------------------------------------------------

CREATE TABLE form_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      uuid NOT NULL REFERENCES form_sections(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label           text NOT NULL,
  field_type      text NOT NULL CHECK (field_type IN (
    'text','textarea','select','multiselect','checkbox',
    'radio','date','file','number','email'
  )),
  options         jsonb,
  is_required     boolean DEFAULT false,
  placeholder     text,
  validation      jsonb,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_form_questions_tenant ON form_questions (tenant_id);
CREATE INDEX idx_form_questions_section ON form_questions (section_id);

-- Policies
CREATE POLICY form_questions_select ON form_questions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_questions_insert ON form_questions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY form_questions_update ON form_questions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_questions_delete ON form_questions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. TABLE: form_submissions
-- ---------------------------------------------------------------

CREATE TABLE form_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contacts(id) ON DELETE SET NULL,
  answers         jsonb NOT NULL,
  ticket_id       uuid REFERENCES tickets(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','processing','completed'
  )),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_form_submissions_tenant ON form_submissions (tenant_id);
CREATE INDEX idx_form_submissions_form ON form_submissions (tenant_id, form_id);
CREATE INDEX idx_form_submissions_ticket ON form_submissions (tenant_id, ticket_id);

-- Policies
CREATE POLICY form_submissions_select ON form_submissions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_submissions_insert ON form_submissions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY form_submissions_update ON form_submissions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_submissions_delete ON form_submissions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 6. TABLE: form_destinations
-- ---------------------------------------------------------------

CREATE TABLE form_destinations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  destination_type  text NOT NULL CHECK (destination_type IN (
    'ticket','email','webhook'
  )),
  config            jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE form_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_destinations FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_form_destinations_tenant ON form_destinations (tenant_id);
CREATE INDEX idx_form_destinations_form ON form_destinations (form_id);

-- Policies
CREATE POLICY form_destinations_select ON form_destinations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_destinations_insert ON form_destinations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY form_destinations_update ON form_destinations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY form_destinations_delete ON form_destinations FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS form_destinations CASCADE;
--   DROP TABLE IF EXISTS form_submissions CASCADE;
--   DROP TABLE IF EXISTS form_questions CASCADE;
--   DROP TABLE IF EXISTS form_sections CASCADE;
--   DROP TABLE IF EXISTS forms CASCADE;
--   DROP TABLE IF EXISTS service_catalogs CASCADE;
-- ═══════════════════════════════════════════════════════════════
