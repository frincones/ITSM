-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00021: ORGANIZATIONS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates organizations (client companies), agent_organizations
--              pivot table, organization_users (portal users), and adds
--              organization_id FK to existing tables.
-- Depends on: 00020_service_catalog_forms.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: organizations
-- ---------------------------------------------------------------

CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  domain          text,
  logo_url        text,
  brand_colors    jsonb DEFAULT '{"primary":"#4f46e5","secondary":"#7c3aed"}'::jsonb,
  industry        text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  address         text,
  notes           text,
  sla_id          uuid REFERENCES slas(id),
  settings        jsonb DEFAULT '{}'::jsonb,
  is_active       boolean DEFAULT true,
  max_users       integer DEFAULT 10,
  contract_start  date,
  contract_end    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_organizations_tenant ON organizations (tenant_id);
CREATE INDEX idx_organizations_tenant_active ON organizations (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_organizations_tenant_sla ON organizations (tenant_id, sla_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY organizations_select ON organizations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY organizations_insert ON organizations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY organizations_update ON organizations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY organizations_delete ON organizations FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: agent_organizations
-- ---------------------------------------------------------------

CREATE TABLE agent_organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_level    text NOT NULL DEFAULT 'full' CHECK (access_level IN ('full','tickets_only','readonly','portal_admin')),
  is_default      boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, organization_id)
);

-- RLS
ALTER TABLE agent_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_organizations FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_agent_organizations_tenant ON agent_organizations (tenant_id);
CREATE INDEX idx_agent_organizations_tenant_agent ON agent_organizations (tenant_id, agent_id);
CREATE INDEX idx_agent_organizations_tenant_org ON agent_organizations (tenant_id, organization_id);

-- Policies
CREATE POLICY agent_organizations_select ON agent_organizations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY agent_organizations_insert ON agent_organizations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY agent_organizations_update ON agent_organizations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY agent_organizations_delete ON agent_organizations FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: organization_users
-- ---------------------------------------------------------------

CREATE TABLE organization_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id),
  name            text NOT NULL,
  email           text NOT NULL,
  phone           text,
  role            text DEFAULT 'user' CHECK (role IN ('admin','manager','user','readonly')),
  is_active       boolean DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- RLS
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_organization_users_tenant ON organization_users (tenant_id);
CREATE INDEX idx_organization_users_tenant_org ON organization_users (tenant_id, organization_id);
CREATE INDEX idx_organization_users_user ON organization_users (user_id);
CREATE INDEX idx_organization_users_tenant_active ON organization_users (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organization_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY organization_users_select ON organization_users FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY organization_users_insert ON organization_users FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY organization_users_update ON organization_users FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY organization_users_delete ON organization_users FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. ALTER EXISTING TABLES: add organization_id FK
-- ---------------------------------------------------------------

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE slas ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Indexes on (tenant_id, organization_id) for high-traffic tables
CREATE INDEX idx_tickets_tenant_org ON tickets (tenant_id, organization_id);
CREATE INDEX idx_contacts_tenant_org ON contacts (tenant_id, organization_id);

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP INDEX IF EXISTS idx_contacts_tenant_org;
--   DROP INDEX IF EXISTS idx_tickets_tenant_org;
--   ALTER TABLE slas DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE projects DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE inbox_conversations DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE kb_articles DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE assets DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE tickets DROP COLUMN IF EXISTS organization_id;
--   DROP TABLE IF EXISTS organization_users CASCADE;
--   DROP TABLE IF EXISTS agent_organizations CASCADE;
--   DROP TABLE IF EXISTS organizations CASCADE;
-- ═══════════════════════════════════════════════════════════════
