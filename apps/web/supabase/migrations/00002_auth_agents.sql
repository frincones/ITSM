-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00002: AUTH & AGENTS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates agent_role ENUM, agents table and contacts
--              table with full RLS policies, indexes, and triggers.
-- Depends on: 00001_core_tenants.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE agent_role AS ENUM ('admin', 'supervisor', 'agent', 'readonly');

-- ---------------------------------------------------------------
-- NOTE: agents table is created below. After that, we replace
-- the stub get_current_tenant_id() from migration 00001.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- 2. TABLE: agents
-- ---------------------------------------------------------------

CREATE TABLE agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  email             text NOT NULL,
  role              agent_role NOT NULL DEFAULT 'agent',
  profile_id        uuid,  -- FK added after profiles table
  skills            text[] DEFAULT '{}',
  avatar_url        text,
  is_active         boolean DEFAULT true,
  last_active_at    timestamptz,
  settings          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id),
  UNIQUE(tenant_id, email)
);

-- RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_agents_tenant ON agents (tenant_id);
CREATE INDEX idx_agents_user ON agents (user_id);
CREATE INDEX idx_agents_tenant_active ON agents (tenant_id) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies: Agents can only see agents in their own tenant
CREATE POLICY agents_select ON agents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY agents_insert ON agents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY agents_update ON agents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY agents_delete ON agents FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: contacts (end users / requesters)
-- ---------------------------------------------------------------

CREATE TABLE contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text,
  email               text,
  phone               text,
  whatsapp_id         text,
  company             text,
  avatar_url          text,
  channel_identifiers jsonb DEFAULT '{}'::jsonb,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_contacts_tenant ON contacts (tenant_id);
CREATE INDEX idx_contacts_tenant_email ON contacts (tenant_id, email);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies: Contacts scoped to tenant
CREATE POLICY contacts_select ON contacts FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_insert ON contacts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_update ON contacts FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY contacts_delete ON contacts FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. REPLACE STUB: get_current_tenant_id()
-- Now that agents table exists, replace the stub from 00001.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  SELECT tenant_id INTO _tenant_id FROM agents WHERE user_id = auth.uid() LIMIT 1;
  RETURN _tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS contacts CASCADE;
--   DROP TABLE IF EXISTS agents CASCADE;
--   DROP TYPE IF EXISTS agent_role;
-- ═══════════════════════════════════════════════════════════════
