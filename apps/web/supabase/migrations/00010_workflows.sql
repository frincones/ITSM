-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00010: WORKFLOWS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates workflow engine tables: workflows, steps,
--              executions, and step logs.
-- Depends on: 00009_ai_agents_rag.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: workflows
-- ---------------------------------------------------------------

CREATE TABLE workflows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  trigger_type    text CHECK (trigger_type IN (
    'ticket_created','ticket_updated','ticket_status_changed',
    'sla_warning','sla_breach','message_received',
    'scheduled','manual','webhook','form_submitted'
  )),
  trigger_config  jsonb,
  is_active       boolean DEFAULT true,
  version         integer DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_workflows_tenant ON workflows (tenant_id);
CREATE INDEX idx_workflows_tenant_active ON workflows (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_workflows_tenant_trigger ON workflows (tenant_id, trigger_type);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY workflows_select ON workflows FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY workflows_insert ON workflows FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY workflows_update ON workflows FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY workflows_delete ON workflows FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: workflow_steps
-- ---------------------------------------------------------------

CREATE TABLE workflow_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_type       text NOT NULL CHECK (step_type IN (
    'condition','action','delay','loop','parallel',
    'ai_decision','human_approval','webhook','sub_workflow'
  )),
  name            text,
  config          jsonb,
  position_x      integer,
  position_y      integer,
  next_step_id    uuid REFERENCES workflow_steps(id) ON DELETE SET NULL,
  false_step_id   uuid REFERENCES workflow_steps(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_workflow_steps_workflow ON workflow_steps (workflow_id);

-- Policies (tenant isolation via workflow join)
CREATE POLICY workflow_steps_select ON workflow_steps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_steps.workflow_id
      AND w.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_steps_insert ON workflow_steps FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_steps.workflow_id
      AND w.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_steps_update ON workflow_steps FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_steps.workflow_id
      AND w.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_steps_delete ON workflow_steps FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflows w WHERE w.id = workflow_steps.workflow_id
      AND w.tenant_id = get_current_tenant_id()
  ));

-- ---------------------------------------------------------------
-- 3. TABLE: workflow_executions
-- ---------------------------------------------------------------

CREATE TABLE workflow_executions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id           uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_resource_type text,
  trigger_resource_id   uuid,
  status                text NOT NULL CHECK (status IN (
    'running','completed','failed','cancelled','waiting'
  )),
  current_step_id       uuid REFERENCES workflow_steps(id) ON DELETE SET NULL,
  execution_data        jsonb,
  started_at            timestamptz DEFAULT now(),
  completed_at          timestamptz,
  error                 text
);

-- RLS
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_workflow_executions_tenant ON workflow_executions (tenant_id);
CREATE INDEX idx_workflow_executions_tenant_status ON workflow_executions (tenant_id, status);
CREATE INDEX idx_workflow_executions_workflow ON workflow_executions (tenant_id, workflow_id);
CREATE INDEX idx_workflow_executions_resource ON workflow_executions (tenant_id, trigger_resource_type, trigger_resource_id);

-- Policies
CREATE POLICY workflow_executions_select ON workflow_executions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY workflow_executions_insert ON workflow_executions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY workflow_executions_update ON workflow_executions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY workflow_executions_delete ON workflow_executions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: workflow_step_logs
-- ---------------------------------------------------------------

CREATE TABLE workflow_step_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id         uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN (
    'started','completed','failed','skipped'
  )),
  input_data      jsonb,
  output_data     jsonb,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE workflow_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_logs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_workflow_step_logs_execution ON workflow_step_logs (execution_id);
CREATE INDEX idx_workflow_step_logs_step ON workflow_step_logs (step_id);

-- Policies (tenant isolation via execution join)
CREATE POLICY workflow_step_logs_select ON workflow_step_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflow_executions we WHERE we.id = workflow_step_logs.execution_id
      AND we.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_step_logs_insert ON workflow_step_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflow_executions we WHERE we.id = workflow_step_logs.execution_id
      AND we.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_step_logs_update ON workflow_step_logs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflow_executions we WHERE we.id = workflow_step_logs.execution_id
      AND we.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY workflow_step_logs_delete ON workflow_step_logs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflow_executions we WHERE we.id = workflow_step_logs.execution_id
      AND we.tenant_id = get_current_tenant_id()
  ));

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS workflow_step_logs CASCADE;
--   DROP TABLE IF EXISTS workflow_executions CASCADE;
--   DROP TABLE IF EXISTS workflow_steps CASCADE;
--   DROP TABLE IF EXISTS workflows CASCADE;
-- ═══════════════════════════════════════════════════════════════
