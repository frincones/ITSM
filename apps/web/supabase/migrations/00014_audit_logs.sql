-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00014: AUDIT LOGS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates audit_logs table with full RLS policies
--              and indexes for compliance and tracking.
-- Depends on: 00013_reports_metrics.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: audit_logs
-- ---------------------------------------------------------------

CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid,
  action          text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'assign', 'escalate', 'close', 'reopen', 'export')),
  resource_type   text,
  resource_id     uuid,
  changes         jsonb,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_audit_logs_tenant ON audit_logs (tenant_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs (tenant_id, user_id, created_at DESC);

-- Policies
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY audit_logs_update ON audit_logs FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY audit_logs_delete ON audit_logs FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS audit_logs CASCADE;
-- ═══════════════════════════════════════════════════════════════
