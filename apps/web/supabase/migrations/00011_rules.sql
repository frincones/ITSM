-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00011: RULES ENGINE
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates the rules engine tables for automated
--              ticket routing, escalation, and business logic.
-- Depends on: 00004_tickets.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE rule_type AS ENUM ('on_create', 'on_update', 'on_schedule', 'on_sla_breach', 'on_escalation');
CREATE TYPE rule_operator AS ENUM (
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'greater_than', 'less_than',
  'in', 'not_in', 'is_null', 'is_not_null',
  'between', 'regex'
);
CREATE TYPE rule_action_type AS ENUM (
  'assign_agent', 'assign_group', 'set_priority', 'set_status',
  'set_category', 'set_type', 'add_tag', 'remove_tag',
  'send_notification', 'send_webhook', 'add_follower',
  'escalate', 'set_sla', 'add_note', 'run_ai_triage'
);

-- ---------------------------------------------------------------
-- 2. TABLE: rules
-- ---------------------------------------------------------------

CREATE TABLE rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  rule_type       rule_type NOT NULL DEFAULT 'on_create',
  is_active       boolean DEFAULT true,
  priority        integer DEFAULT 0,
  stop_on_match   boolean DEFAULT false,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- RLS
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_rules_tenant ON rules (tenant_id);
CREATE INDEX idx_rules_tenant_type_active ON rules (tenant_id, rule_type, is_active)
  WHERE is_active = true;
CREATE INDEX idx_rules_tenant_priority ON rules (tenant_id, priority);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY rules_select ON rules FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rules_insert ON rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY rules_update ON rules FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rules_delete ON rules FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: rule_conditions
-- ---------------------------------------------------------------

CREATE TABLE rule_conditions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id         uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field           text NOT NULL,
  operator        rule_operator NOT NULL DEFAULT 'equals',
  value           jsonb NOT NULL,
  logical_group   integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_conditions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_rule_conditions_tenant ON rule_conditions (tenant_id);
CREATE INDEX idx_rule_conditions_rule ON rule_conditions (rule_id);

-- Policies
CREATE POLICY rule_conditions_select ON rule_conditions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_conditions_insert ON rule_conditions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY rule_conditions_update ON rule_conditions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_conditions_delete ON rule_conditions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: rule_actions
-- ---------------------------------------------------------------

CREATE TABLE rule_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id           uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  action_type       rule_action_type NOT NULL,
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_order   integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE rule_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_actions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_rule_actions_tenant ON rule_actions (tenant_id);
CREATE INDEX idx_rule_actions_rule ON rule_actions (rule_id);

-- Policies
CREATE POLICY rule_actions_select ON rule_actions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_actions_insert ON rule_actions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY rule_actions_update ON rule_actions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_actions_delete ON rule_actions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. TABLE: rule_execution_logs
-- ---------------------------------------------------------------

CREATE TABLE rule_execution_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id             uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  ticket_id           uuid REFERENCES tickets(id) ON DELETE SET NULL,
  matched             boolean NOT NULL DEFAULT false,
  actions_executed    jsonb DEFAULT '[]'::jsonb,
  execution_time_ms   integer,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE rule_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_execution_logs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_rule_execution_logs_tenant ON rule_execution_logs (tenant_id);
CREATE INDEX idx_rule_execution_logs_rule ON rule_execution_logs (rule_id, created_at DESC);
CREATE INDEX idx_rule_execution_logs_ticket ON rule_execution_logs (ticket_id)
  WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_rule_execution_logs_tenant_created ON rule_execution_logs (tenant_id, created_at DESC);

-- Policies
CREATE POLICY rule_execution_logs_select ON rule_execution_logs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_execution_logs_insert ON rule_execution_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY rule_execution_logs_update ON rule_execution_logs FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY rule_execution_logs_delete ON rule_execution_logs FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS rule_execution_logs CASCADE;
--   DROP TABLE IF EXISTS rule_actions CASCADE;
--   DROP TABLE IF EXISTS rule_conditions CASCADE;
--   DROP TABLE IF EXISTS rules CASCADE;
--   DROP TYPE IF EXISTS rule_action_type;
--   DROP TYPE IF EXISTS rule_operator;
--   DROP TYPE IF EXISTS rule_type;
-- ═══════════════════════════════════════════════════════════════
