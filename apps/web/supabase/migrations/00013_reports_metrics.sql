-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00013: REPORTS & METRICS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates ticket_metrics and daily_metrics tables
--              with full RLS policies, indexes, and triggers.
-- Depends on: 00012_notifications.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: ticket_metrics
-- ---------------------------------------------------------------

CREATE TABLE ticket_metrics (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id                 uuid NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  first_response_minutes    integer,
  resolution_minutes        integer,
  sla_first_response_met    boolean,
  sla_resolution_met        boolean,
  reopen_count              integer DEFAULT 0,
  reassignment_count        integer DEFAULT 0,
  followup_count            integer,
  task_count                integer,
  agent_touch_count         integer,
  ai_interactions           integer,
  ai_resolved               boolean DEFAULT false,
  satisfaction_score        integer,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ticket_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_metrics FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ticket_metrics_tenant ON ticket_metrics (tenant_id);
CREATE INDEX idx_ticket_metrics_ticket ON ticket_metrics (tenant_id, ticket_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY ticket_metrics_select ON ticket_metrics FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_metrics_insert ON ticket_metrics FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_metrics_update ON ticket_metrics FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_metrics_delete ON ticket_metrics FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: daily_metrics
-- ---------------------------------------------------------------

CREATE TABLE daily_metrics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date                    date NOT NULL,
  ticket_type             text,
  status                  text,
  channel                 text,
  priority                integer,
  group_id                uuid,
  count                   integer NOT NULL DEFAULT 0,
  avg_resolution_minutes  float,
  sla_met_count           integer DEFAULT 0,
  sla_breached_count      integer DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_daily_metrics_tenant ON daily_metrics (tenant_id);
CREATE INDEX idx_daily_metrics_composite ON daily_metrics (tenant_id, date, ticket_type, status);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY daily_metrics_select ON daily_metrics FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY daily_metrics_insert ON daily_metrics FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY daily_metrics_update ON daily_metrics FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY daily_metrics_delete ON daily_metrics FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS daily_metrics CASCADE;
--   DROP TABLE IF EXISTS ticket_metrics CASCADE;
-- ═══════════════════════════════════════════════════════════════
