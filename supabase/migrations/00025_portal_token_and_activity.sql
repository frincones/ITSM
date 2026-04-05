-- Migration: 00025_portal_token_and_activity.sql
-- Description: Add portal_token to organizations for link-based portal access
--              + portal_activity_log table for tracking user behavior in portal
-- Author: db-integration agent
-- Date: 2026-04-05

-- ========================================
-- SECTION 1: PORTAL TOKEN ON ORGANIZATIONS
-- ========================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_token uuid UNIQUE DEFAULT gen_random_uuid();

-- Backfill existing orgs that got NULL
UPDATE organizations SET portal_token = gen_random_uuid() WHERE portal_token IS NULL;

-- Now make it NOT NULL
ALTER TABLE organizations ALTER COLUMN portal_token SET NOT NULL;
ALTER TABLE organizations ALTER COLUMN portal_token SET DEFAULT gen_random_uuid();

COMMENT ON COLUMN organizations.portal_token IS
  'Unique token used to generate embeddable portal URLs. '
  'Clients place this link in their app as a Help button. '
  'Format: https://app.novadesk.com/portal/{portal_token}';

-- Index for fast lookup by token
CREATE INDEX IF NOT EXISTS idx_organizations_portal_token
  ON organizations (portal_token);

-- ========================================
-- SECTION 2: PORTAL ACTIVITY LOG
-- ========================================

CREATE TABLE IF NOT EXISTS portal_activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL,
  user_email      text,
  user_name       text,

  -- Event data
  event_type      text NOT NULL,
    -- Possible values:
    -- 'page_view'        : user navigated to a page
    -- 'article_view'     : user opened a KB article
    -- 'article_search'   : user searched in KB
    -- 'chat_start'       : user started a chat conversation
    -- 'chat_message'     : user sent a message in chat
    -- 'ticket_view'      : user viewed a ticket
    -- 'ticket_create'    : ticket was created from chat
    -- 'file_upload'      : user uploaded a file
    -- 'button_click'     : user clicked a UI element
    -- 'category_select'  : user selected a quick category
    -- 'feedback'         : user gave article feedback

  event_data      jsonb DEFAULT '{}'::jsonb,
    -- Flexible payload per event_type:
    -- page_view:       { "path": "/portal/.../kb", "title": "Knowledge Base" }
    -- article_view:    { "article_id": "...", "slug": "...", "title": "..." }
    -- chat_message:    { "conversation_id": "...", "message_preview": "..." }
    -- button_click:    { "element": "quick_category", "label": "Problema tecnico" }
    -- ticket_create:   { "ticket_id": "...", "ticket_number": "TKT-..." }

  -- Context
  page_url        text,
  user_agent      text,
  ip_address      inet,

  -- Conversation link (when activity is related to a chat)
  conversation_id uuid,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ========================================
-- SECTION 3: RLS
-- ========================================
ALTER TABLE portal_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_activity_log FORCE ROW LEVEL SECURITY;

-- Agents can read activity logs for their tenant
CREATE POLICY portal_activity_log_select ON portal_activity_log
  FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Portal API inserts via service_role, but authenticated users can also insert
CREATE POLICY portal_activity_log_insert ON portal_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

-- No update/delete from app layer
CREATE POLICY portal_activity_log_update ON portal_activity_log
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY portal_activity_log_delete ON portal_activity_log
  FOR DELETE TO authenticated
  USING (false);

-- ========================================
-- SECTION 4: INDEXES
-- ========================================

CREATE INDEX idx_portal_activity_tenant
  ON portal_activity_log (tenant_id);

CREATE INDEX idx_portal_activity_session
  ON portal_activity_log (session_id, created_at DESC);

CREATE INDEX idx_portal_activity_conversation
  ON portal_activity_log (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX idx_portal_activity_org_user
  ON portal_activity_log (organization_id, user_email, created_at DESC);

-- ========================================
-- SECTION 5: ROLLBACK (Commented)
-- ========================================
/*
DROP TABLE IF EXISTS portal_activity_log;
ALTER TABLE organizations DROP COLUMN IF EXISTS portal_token;
*/
