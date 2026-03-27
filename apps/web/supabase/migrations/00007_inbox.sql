-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00007: Inbox (Omnichannel)
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates inbox_channels, inbox_conversations, and
--              inbox_messages tables for omnichannel communication.
--              Also adds FK from tickets.inbox_message_id.
-- Depends on: 00006_sla_ola.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: inbox_channels
-- ---------------------------------------------------------------

CREATE TABLE inbox_channels (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type          text NOT NULL CHECK (channel_type IN (
                          'email_imap', 'email_office365', 'email_gmail',
                          'whatsapp', 'web_widget', 'api', 'web_form'
                        )),
  name                  text NOT NULL,
  config                jsonb DEFAULT '{}'::jsonb,
  is_active             boolean DEFAULT true,
  auto_create_ticket    boolean DEFAULT true,
  default_category_id   uuid REFERENCES categories(id),
  default_group_id      uuid REFERENCES groups(id),
  ai_processing         boolean DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE inbox_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_channels FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_inbox_channels_tenant ON inbox_channels (tenant_id);
CREATE INDEX idx_inbox_channels_tenant_active ON inbox_channels (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON inbox_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY inbox_channels_select ON inbox_channels FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_channels_insert ON inbox_channels FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_channels_update ON inbox_channels FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_channels_delete ON inbox_channels FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: inbox_conversations
-- ---------------------------------------------------------------

CREATE TABLE inbox_conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id            uuid NOT NULL REFERENCES inbox_channels(id) ON DELETE CASCADE,
  contact_id            uuid REFERENCES contacts(id),
  ticket_id             uuid REFERENCES tickets(id),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN (
                          'open', 'pending', 'snoozed', 'resolved'
                        )),
  subject               text,
  last_message_at       timestamptz,
  assigned_agent_id     uuid REFERENCES agents(id),
  assigned_group_id     uuid REFERENCES groups(id),
  ai_summary            text,
  metadata              jsonb DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_conversations FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_inbox_conversations_tenant ON inbox_conversations (tenant_id);
CREATE INDEX idx_inbox_conversations_tenant_status ON inbox_conversations (tenant_id, status, last_message_at DESC);
CREATE INDEX idx_inbox_conversations_tenant_channel ON inbox_conversations (tenant_id, channel_id);
CREATE INDEX idx_inbox_conversations_tenant_contact ON inbox_conversations (tenant_id, contact_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON inbox_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY inbox_conversations_select ON inbox_conversations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_conversations_insert ON inbox_conversations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_conversations_update ON inbox_conversations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_conversations_delete ON inbox_conversations FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: inbox_messages
-- ---------------------------------------------------------------

CREATE TABLE inbox_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id       uuid NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  direction             text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type           text NOT NULL CHECK (sender_type IN (
                          'contact', 'agent', 'ai_agent', 'system'
                        )),
  sender_id             uuid,
  content_text          text,
  content_html          text,
  attachments           jsonb DEFAULT '[]'::jsonb,
  channel_message_id    text,
  ai_classification     jsonb,
  metadata              jsonb DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_inbox_messages_tenant ON inbox_messages (tenant_id);
CREATE INDEX idx_inbox_messages_conversation ON inbox_messages (conversation_id, created_at DESC);
CREATE INDEX idx_inbox_messages_tenant_created ON inbox_messages (tenant_id, created_at DESC);

-- Policies
CREATE POLICY inbox_messages_select ON inbox_messages FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_messages_insert ON inbox_messages FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_messages_update ON inbox_messages FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY inbox_messages_delete ON inbox_messages FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. ALTER TABLES: Add FK references
-- ---------------------------------------------------------------

-- tickets.inbox_message_id -> inbox_messages
ALTER TABLE tickets ADD CONSTRAINT IF NOT EXISTS tickets_inbox_message_fkey
  FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id);

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_inbox_message_fkey;
--   DROP TABLE IF EXISTS inbox_messages CASCADE;
--   DROP TABLE IF EXISTS inbox_conversations CASCADE;
--   DROP TABLE IF EXISTS inbox_channels CASCADE;
-- ═══════════════════════════════════════════════════════════════
