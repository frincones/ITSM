-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00018: WEBHOOKS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates webhooks and webhook_logs tables with
--              full RLS policies, indexes, and triggers.
-- Depends on: 00017_partners.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: webhooks
-- ---------------------------------------------------------------

CREATE TABLE webhooks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction         text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  name              text NOT NULL,
  url               text NOT NULL,
  secret            text,
  events            text[] DEFAULT '{}',
  headers           jsonb DEFAULT '{}'::jsonb,
  is_active         boolean DEFAULT true,
  last_triggered_at timestamptz,
  failure_count     integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_webhooks_tenant ON webhooks (tenant_id);
CREATE INDEX idx_webhooks_tenant_active ON webhooks (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_webhooks_tenant_direction ON webhooks (tenant_id, direction);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY webhooks_select ON webhooks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY webhooks_insert ON webhooks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY webhooks_update ON webhooks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY webhooks_delete ON webhooks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: webhook_logs
-- ---------------------------------------------------------------

CREATE TABLE webhook_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event           text NOT NULL,
  payload         jsonb,
  response_status integer,
  response_body   text,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_webhook_logs_tenant ON webhook_logs (tenant_id);
CREATE INDEX idx_webhook_logs_webhook ON webhook_logs (tenant_id, webhook_id, created_at DESC);

-- Policies
CREATE POLICY webhook_logs_select ON webhook_logs FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY webhook_logs_insert ON webhook_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY webhook_logs_update ON webhook_logs FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY webhook_logs_delete ON webhook_logs FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS webhook_logs CASCADE;
--   DROP TABLE IF EXISTS webhooks CASCADE;
-- ═══════════════════════════════════════════════════════════════
