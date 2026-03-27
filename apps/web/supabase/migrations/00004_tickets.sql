-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00004: TICKETS
-- ═══════════════════════════════════════════════════════════════

-- Enum types
CREATE TYPE ticket_type AS ENUM ('incident', 'request', 'warranty', 'support', 'backlog');
CREATE TYPE ticket_status AS ENUM (
  'new', 'assigned', 'in_progress', 'pending', 'testing',
  'resolved', 'closed', 'cancelled'
);
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE ticket_channel AS ENUM (
  'portal', 'email', 'whatsapp', 'phone', 'api', 'ai_agent', 'web_widget'
);

-- Categories (hierarchical)
CREATE TABLE categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  parent_id         uuid REFERENCES categories(id),
  applies_to        text[] DEFAULT '{ticket,problem,change}',
  default_group_id  uuid REFERENCES groups(id),
  default_sla_id    uuid, -- FK added later
  icon              text,
  sort_order        integer DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_categories_tenant ON categories (tenant_id);
CREATE INDEX idx_categories_parent ON categories (tenant_id, parent_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY categories_select ON categories FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY categories_delete ON categories FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Services
CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES categories(id),
  name            text NOT NULL,
  description     text,
  sla_id          uuid, -- FK added later
  owner_group_id  uuid REFERENCES groups(id),
  is_active       boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_services_tenant ON services (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY services_select ON services FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY services_insert ON services FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY services_update ON services FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY services_delete ON services FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- TICKETS (main table)
CREATE TABLE tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_number         text NOT NULL,
  title                 text NOT NULL,
  description           text NOT NULL,
  description_html      text,

  -- AI Classification
  type                  ticket_type NOT NULL DEFAULT 'incident',
  ai_classification     jsonb,
  ai_classified_at      timestamptz,
  ai_classified_by      text,

  -- Status & Workflow
  status                ticket_status NOT NULL DEFAULT 'new',
  urgency               severity_level NOT NULL DEFAULT 'medium',
  impact                severity_level NOT NULL DEFAULT 'medium',
  priority              integer NOT NULL DEFAULT 3,

  -- Assignment
  requester_id          uuid REFERENCES contacts(id),
  requester_email       text,
  assigned_agent_id     uuid REFERENCES agents(id),
  assigned_group_id     uuid REFERENCES groups(id),
  escalation_level      integer DEFAULT 0,

  -- SLA
  sla_id                uuid,  -- FK added later
  ola_id                uuid,  -- FK added later
  sla_due_date          timestamptz,
  ola_due_date          timestamptz,
  sla_breached          boolean DEFAULT false,
  ola_breached          boolean DEFAULT false,

  -- Categorization
  category_id           uuid REFERENCES categories(id),
  subcategory_id        uuid REFERENCES categories(id),
  service_id            uuid REFERENCES services(id),

  -- Channel
  channel               ticket_channel DEFAULT 'portal',
  inbox_message_id      uuid,  -- FK added later

  -- AI Context
  ai_summary            text,
  ai_suggested_solution text,
  ai_evidence           jsonb,
  ai_repository_refs    jsonb,

  -- Metadata
  tags                  text[] DEFAULT '{}',
  custom_fields         jsonb DEFAULT '{}'::jsonb,
  internal_notes        text,

  -- Timestamps
  resolved_at           timestamptz,
  closed_at             timestamptz,
  first_response_at     timestamptz,
  created_by            uuid REFERENCES auth.users(id),
  updated_by            uuid REFERENCES auth.users(id),
  deleted_at            timestamptz,
  deleted_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, ticket_number)
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

-- Critical indexes for performance
CREATE INDEX idx_tickets_tenant ON tickets (tenant_id);
CREATE INDEX idx_tickets_tenant_status ON tickets (tenant_id, status);
CREATE INDEX idx_tickets_tenant_type_status ON tickets (tenant_id, type, status);
CREATE INDEX idx_tickets_tenant_assigned ON tickets (tenant_id, assigned_agent_id, status);
CREATE INDEX idx_tickets_tenant_group ON tickets (tenant_id, assigned_group_id, status);
CREATE INDEX idx_tickets_tenant_sla ON tickets (tenant_id, sla_due_date)
  WHERE status NOT IN ('closed', 'cancelled') AND deleted_at IS NULL;
CREATE INDEX idx_tickets_tenant_created ON tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_number ON tickets (ticket_number);
CREATE INDEX idx_tickets_requester ON tickets (tenant_id, requester_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Ticket number generation function
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix text;
  seq_num integer;
BEGIN
  SELECT ticket_prefix INTO prefix FROM tenant_settings WHERE tenant_id = NEW.tenant_id;
  IF prefix IS NULL THEN prefix := 'TKT'; END IF;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(ticket_number, '-', 3) AS integer)
  ), 0) + 1 INTO seq_num
  FROM tickets WHERE tenant_id = NEW.tenant_id;

  NEW.ticket_number := prefix || '-' || TO_CHAR(now(), 'YYMM') || '-' || LPAD(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number BEFORE INSERT ON tickets
  FOR EACH ROW WHEN (NEW.ticket_number IS NULL)
  EXECUTE FUNCTION generate_ticket_number();

-- Priority calculation trigger
CREATE OR REPLACE FUNCTION calculate_priority()
RETURNS TRIGGER AS $$
DECLARE
  urgency_val integer;
  impact_val integer;
BEGIN
  urgency_val := CASE NEW.urgency
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3
    WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END;
  impact_val := CASE NEW.impact
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3
    WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END;
  NEW.priority := urgency_val * impact_val;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_priority BEFORE INSERT OR UPDATE OF urgency, impact ON tickets
  FOR EACH ROW EXECUTE FUNCTION calculate_priority();

-- ═══════════════════════════════════════════════════════════════
-- TICKET SUB-ENTITIES
-- ═══════════════════════════════════════════════════════════════

-- Ticket Followups
CREATE TABLE ticket_followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  content       text NOT NULL,
  content_html  text,
  is_private    boolean DEFAULT false,
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  author_type   text DEFAULT 'agent' CHECK (author_type IN ('agent', 'contact', 'ai_agent', 'system')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_followups FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_followups_ticket ON ticket_followups (ticket_id, created_at DESC);

CREATE POLICY ticket_followups_select ON ticket_followups FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_followups_insert ON ticket_followups FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Ticket Tasks
CREATE TABLE ticket_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id         uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  status            text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_agent_id uuid REFERENCES agents(id),
  due_date          timestamptz,
  estimated_hours   float,
  actual_hours      float,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tasks FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_tasks_ticket ON ticket_tasks (ticket_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_tasks_select ON ticket_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_insert ON ticket_tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_update ON ticket_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_tasks_delete ON ticket_tasks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Ticket Solutions
CREATE TABLE ticket_solutions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  content       text NOT NULL,
  content_html  text,
  is_approved   boolean DEFAULT false,
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  ai_generated  boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_solutions FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_solutions_ticket ON ticket_solutions (ticket_id);

CREATE POLICY ticket_solutions_select ON ticket_solutions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_solutions_insert ON ticket_solutions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Ticket Validations
CREATE TABLE ticket_validations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  validator_id    uuid NOT NULL REFERENCES agents(id),
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment         text,
  validated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_validations FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_validations_select ON ticket_validations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_validations_insert ON ticket_validations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_validations_update ON ticket_validations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Ticket Costs
CREATE TABLE ticket_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cost_type     text NOT NULL CHECK (cost_type IN ('labor', 'material', 'external', 'other')),
  amount        decimal(12,2) NOT NULL,
  currency      text DEFAULT 'USD',
  description   text,
  agent_id      uuid REFERENCES agents(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_costs FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_costs_select ON ticket_costs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_costs_insert ON ticket_costs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Ticket Satisfactions
CREATE TABLE ticket_satisfactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  score         integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       text,
  contact_id    uuid REFERENCES contacts(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_satisfactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_satisfactions FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_satisfactions_select ON ticket_satisfactions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_satisfactions_insert ON ticket_satisfactions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Ticket Attachments
CREATE TABLE ticket_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  file_url      text NOT NULL,
  mime_type     text,
  file_size     bigint,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments (ticket_id);

CREATE POLICY ticket_attachments_select ON ticket_attachments FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_attachments_insert ON ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Ticket Relations
CREATE TABLE ticket_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  related_ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  relation_type   text NOT NULL CHECK (relation_type IN ('duplicate', 'related', 'parent', 'child', 'blocks', 'blocked_by')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, related_ticket_id, relation_type)
);

ALTER TABLE ticket_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_relations FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_relations_select ON ticket_relations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_relations_insert ON ticket_relations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Templates
CREATE TABLE ticket_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  predefined_fields jsonb DEFAULT '{}'::jsonb,
  mandatory_fields  text[] DEFAULT '{}',
  hidden_fields     text[] DEFAULT '{}',
  readonly_fields   text[] DEFAULT '{}',
  is_active         boolean DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_templates FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_ticket_templates_tenant ON ticket_templates (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_templates_select ON ticket_templates FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_insert ON ticket_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_update ON ticket_templates FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_templates_delete ON ticket_templates FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Recurrent tickets
CREATE TABLE ticket_recurrents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES ticket_templates(id),
  name              text NOT NULL,
  cron_expression   text NOT NULL,
  is_active         boolean DEFAULT true,
  last_generated_at timestamptz,
  next_generate_at  timestamptz,
  config            jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_recurrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_recurrents FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_recurrents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ticket_recurrents_select ON ticket_recurrents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_recurrents_insert ON ticket_recurrents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_recurrents_update ON ticket_recurrents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
