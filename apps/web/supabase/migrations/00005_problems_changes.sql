-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00005: PROBLEMS & CHANGES
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates problem management and change management
--              tables with full RLS policies, indexes, and triggers.
-- Depends on: 00004_tickets.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE problem_status AS ENUM (
  'new', 'accepted', 'analysis', 'root_cause_identified',
  'solution_planned', 'resolved', 'closed'
);

CREATE TYPE change_status AS ENUM (
  'new', 'evaluation', 'approval_pending', 'approved', 'scheduled',
  'in_progress', 'testing', 'implemented', 'rolled_back', 'closed', 'rejected'
);

CREATE TYPE change_type AS ENUM ('standard', 'normal', 'emergency');

-- ---------------------------------------------------------------
-- 2. TABLE: problems
-- ---------------------------------------------------------------

CREATE TABLE problems (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_number      text NOT NULL,
  title               text NOT NULL,
  description         text,
  status              problem_status NOT NULL DEFAULT 'new',
  urgency             severity_level NOT NULL DEFAULT 'medium',
  impact              severity_level NOT NULL DEFAULT 'medium',
  priority            integer NOT NULL DEFAULT 3,
  root_cause          text,
  root_cause_ai       text,
  workaround          text,
  solution            text,
  category_id         uuid REFERENCES categories(id),
  assigned_agent_id   uuid REFERENCES agents(id),
  assigned_group_id   uuid REFERENCES groups(id),
  ai_pattern_detected jsonb,
  resolved_at         timestamptz,
  created_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, problem_number)
);

-- RLS
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_problems_tenant ON problems (tenant_id);
CREATE INDEX idx_problems_tenant_status ON problems (tenant_id, status);
CREATE INDEX idx_problems_tenant_assigned ON problems (tenant_id, assigned_agent_id, status);
CREATE INDEX idx_problems_tenant_group ON problems (tenant_id, assigned_group_id, status);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY problems_select ON problems FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY problems_insert ON problems FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY problems_update ON problems FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY problems_delete ON problems FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Problem number generation function
CREATE OR REPLACE FUNCTION generate_problem_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(problem_number, '-', 3) AS integer)
  ), 0) + 1 INTO seq_num
  FROM problems WHERE tenant_id = NEW.tenant_id;

  NEW.problem_number := 'PRB-' || TO_CHAR(now(), 'YYMM') || '-' || LPAD(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_problem_number BEFORE INSERT ON problems
  FOR EACH ROW WHEN (NEW.problem_number IS NULL)
  EXECUTE FUNCTION generate_problem_number();

-- Priority calculation trigger (reuse same logic as tickets)
CREATE TRIGGER calc_priority BEFORE INSERT OR UPDATE OF urgency, impact ON problems
  FOR EACH ROW EXECUTE FUNCTION calculate_priority();

-- ---------------------------------------------------------------
-- 3. TABLE: problem_ticket_links
-- ---------------------------------------------------------------

CREATE TABLE problem_ticket_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id  uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(problem_id, ticket_id)
);

-- RLS
ALTER TABLE problem_ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_ticket_links FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_problem_ticket_links_tenant ON problem_ticket_links (tenant_id);
CREATE INDEX idx_problem_ticket_links_problem ON problem_ticket_links (problem_id);
CREATE INDEX idx_problem_ticket_links_ticket ON problem_ticket_links (ticket_id);

-- Policies
CREATE POLICY ptl_select ON problem_ticket_links FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ptl_insert ON problem_ticket_links FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ptl_update ON problem_ticket_links FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ptl_delete ON problem_ticket_links FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: problem_tasks
-- ---------------------------------------------------------------

CREATE TABLE problem_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id        uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
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

-- RLS
ALTER TABLE problem_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_tasks FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_problem_tasks_tenant ON problem_tasks (tenant_id);
CREATE INDEX idx_problem_tasks_problem ON problem_tasks (problem_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON problem_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY problem_tasks_select ON problem_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY problem_tasks_insert ON problem_tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY problem_tasks_update ON problem_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY problem_tasks_delete ON problem_tasks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. TABLE: changes
-- ---------------------------------------------------------------

CREATE TABLE changes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_number       text NOT NULL,
  title               text NOT NULL,
  description         text,
  status              change_status NOT NULL DEFAULT 'new',
  change_type         change_type NOT NULL DEFAULT 'normal',
  risk_level          severity_level NOT NULL DEFAULT 'medium',
  impact_analysis     text,
  rollback_plan       text,
  implementation_plan text,
  scheduled_start     timestamptz,
  scheduled_end       timestamptz,
  actual_start        timestamptz,
  actual_end          timestamptz,
  category_id         uuid REFERENCES categories(id),
  assigned_agent_id   uuid REFERENCES agents(id),
  assigned_group_id   uuid REFERENCES groups(id),
  approval_status     text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ai_risk_assessment  jsonb,
  ai_impact_analysis  jsonb,
  created_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, change_number)
);

-- RLS
ALTER TABLE changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_changes_tenant ON changes (tenant_id);
CREATE INDEX idx_changes_tenant_status ON changes (tenant_id, status);
CREATE INDEX idx_changes_tenant_type ON changes (tenant_id, change_type, status);
CREATE INDEX idx_changes_tenant_assigned ON changes (tenant_id, assigned_agent_id, status);
CREATE INDEX idx_changes_tenant_group ON changes (tenant_id, assigned_group_id, status);
CREATE INDEX idx_changes_tenant_scheduled ON changes (tenant_id, scheduled_start)
  WHERE status NOT IN ('closed', 'rejected', 'rolled_back') AND deleted_at IS NULL;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY changes_select ON changes FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY changes_insert ON changes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY changes_update ON changes FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY changes_delete ON changes FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Change number generation function
CREATE OR REPLACE FUNCTION generate_change_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(change_number, '-', 3) AS integer)
  ), 0) + 1 INTO seq_num
  FROM changes WHERE tenant_id = NEW.tenant_id;

  NEW.change_number := 'CHG-' || TO_CHAR(now(), 'YYMM') || '-' || LPAD(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_change_number BEFORE INSERT ON changes
  FOR EACH ROW WHEN (NEW.change_number IS NULL)
  EXECUTE FUNCTION generate_change_number();

-- ---------------------------------------------------------------
-- 6. TABLE: change_tasks
-- ---------------------------------------------------------------

CREATE TABLE change_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id         uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
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

-- RLS
ALTER TABLE change_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_tasks FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_change_tasks_tenant ON change_tasks (tenant_id);
CREATE INDEX idx_change_tasks_change ON change_tasks (change_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON change_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY change_tasks_select ON change_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY change_tasks_insert ON change_tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY change_tasks_update ON change_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY change_tasks_delete ON change_tasks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 7. TABLE: change_validations (CAB approval)
-- ---------------------------------------------------------------

CREATE TABLE change_validations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id       uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  validator_id    uuid NOT NULL REFERENCES agents(id),
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment         text,
  validated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE change_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_validations FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_change_validations_tenant ON change_validations (tenant_id);
CREATE INDEX idx_change_validations_change ON change_validations (change_id);

-- Policies
CREATE POLICY cv_select ON change_validations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY cv_insert ON change_validations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY cv_update ON change_validations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY cv_delete ON change_validations FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 8. TABLE: change_costs
-- ---------------------------------------------------------------

CREATE TABLE change_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id     uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  cost_type     text NOT NULL CHECK (cost_type IN ('labor', 'material', 'external', 'other')),
  amount        decimal(12,2) NOT NULL,
  currency      text DEFAULT 'USD',
  description   text,
  agent_id      uuid REFERENCES agents(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE change_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_costs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_change_costs_tenant ON change_costs (tenant_id);
CREATE INDEX idx_change_costs_change ON change_costs (change_id);

-- Policies
CREATE POLICY change_costs_select ON change_costs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY change_costs_insert ON change_costs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY change_costs_update ON change_costs FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY change_costs_delete ON change_costs FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS change_costs CASCADE;
--   DROP TABLE IF EXISTS change_validations CASCADE;
--   DROP TABLE IF EXISTS change_tasks CASCADE;
--   DROP TABLE IF EXISTS changes CASCADE;
--   DROP TABLE IF EXISTS problem_tasks CASCADE;
--   DROP TABLE IF EXISTS problem_ticket_links CASCADE;
--   DROP TABLE IF EXISTS problems CASCADE;
--   DROP TYPE IF EXISTS change_type;
--   DROP TYPE IF EXISTS change_status;
--   DROP TYPE IF EXISTS problem_status;
--   DROP FUNCTION IF EXISTS generate_change_number();
--   DROP FUNCTION IF EXISTS generate_problem_number();
-- ═══════════════════════════════════════════════════════════════
