-- Migration: 00029_client_access_rls.sql
-- Description: Tighten RLS for client (org_user) access to tickets + notifications realtime
-- Date: 2026-04-14

-- 1. Add notification type column for categorization
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text DEFAULT 'ticket';

-- 2. Enable Realtime on notifications table (needed for toast popups and bell badge)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 3. Tighten RLS on notifications — users can only see their own notifications
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND user_id = auth.uid());

-- Keep INSERT policy tenant-scoped (service role inserts for other users)
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- 4. Index for notification type queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_type
  ON notifications (tenant_id, user_id, type, is_read);
