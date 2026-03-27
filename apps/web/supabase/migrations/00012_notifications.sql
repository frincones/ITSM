-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00012: NOTIFICATIONS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates notification_templates, notification_queue,
--              and notifications tables with full RLS policies,
--              indexes, and triggers.
-- Depends on: 00011_rules.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: notification_templates
-- ---------------------------------------------------------------

CREATE TABLE notification_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('email', 'in_app', 'webhook', 'whatsapp')),
  subject_template text,
  body_template   text,
  is_active       boolean DEFAULT true,
  language        text DEFAULT 'es',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_notification_templates_tenant ON notification_templates (tenant_id);
CREATE INDEX idx_notification_templates_event ON notification_templates (tenant_id, event_type, channel);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY notification_templates_select ON notification_templates FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notification_templates_insert ON notification_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY notification_templates_update ON notification_templates FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notification_templates_delete ON notification_templates FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: notification_queue
-- ---------------------------------------------------------------

CREATE TABLE notification_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES notification_templates(id) ON DELETE SET NULL,
  channel           text NOT NULL,
  recipient_type    text NOT NULL CHECK (recipient_type IN ('agent', 'contact', 'group', 'partner')),
  recipient_id      uuid,
  recipient_address text,
  subject           text,
  body              text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts          integer DEFAULT 0,
  last_attempt_at   timestamptz,
  error             text,
  scheduled_for     timestamptz,
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_notification_queue_tenant ON notification_queue (tenant_id);
CREATE INDEX idx_notification_queue_pending ON notification_queue (tenant_id, status, scheduled_for)
  WHERE status = 'pending';

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY notification_queue_select ON notification_queue FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notification_queue_insert ON notification_queue FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY notification_queue_update ON notification_queue FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notification_queue_delete ON notification_queue FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: notifications (in-app notifications for users)
-- ---------------------------------------------------------------

CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text,
  link            text,
  is_read         boolean DEFAULT false,
  resource_type   text,
  resource_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_notifications_tenant ON notifications (tenant_id);
CREATE INDEX idx_notifications_user_read ON notifications (tenant_id, user_id, is_read);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY notifications_delete ON notifications FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS notifications CASCADE;
--   DROP TABLE IF EXISTS notification_queue CASCADE;
--   DROP TABLE IF EXISTS notification_templates CASCADE;
-- ═══════════════════════════════════════════════════════════════
