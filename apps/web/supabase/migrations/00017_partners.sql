-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00017: PARTNERS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates partners, partner_agents, and
--              ticket_partner_assignments tables with full RLS
--              policies, indexes, and triggers. Updates
--              get_current_tenant_id() to include partner_agents.
-- Depends on: 00016_assets.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: partners
-- ---------------------------------------------------------------

CREATE TABLE partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('provider', 'partner', 'vendor', 'subcontractor')),
  contact_email   text,
  contact_phone   text,
  sla_id          uuid REFERENCES slas(id),
  is_active       boolean DEFAULT true,
  api_key         text,
  config          jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_partners_tenant ON partners (tenant_id);
CREATE INDEX idx_partners_tenant_active ON partners (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY partners_select ON partners FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY partners_insert ON partners FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY partners_update ON partners FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY partners_delete ON partners FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: partner_agents
-- ---------------------------------------------------------------

CREATE TABLE partner_agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  permissions jsonb DEFAULT '{}'::jsonb,
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(partner_id, user_id)
);

-- RLS
ALTER TABLE partner_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_agents FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_partner_agents_tenant ON partner_agents (tenant_id);
CREATE INDEX idx_partner_agents_partner ON partner_agents (tenant_id, partner_id);
CREATE INDEX idx_partner_agents_user ON partner_agents (user_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON partner_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY partner_agents_select ON partner_agents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY partner_agents_insert ON partner_agents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY partner_agents_update ON partner_agents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY partner_agents_delete ON partner_agents FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: ticket_partner_assignments
-- ---------------------------------------------------------------

CREATE TABLE ticket_partner_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id         uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  partner_id        uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  partner_agent_id  uuid REFERENCES partner_agents(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'in_progress', 'completed', 'rejected')),
  notes             text,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ticket_partner_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_partner_assignments FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ticket_partner_assignments_tenant ON ticket_partner_assignments (tenant_id);
CREATE INDEX idx_ticket_partner_assignments_ticket ON ticket_partner_assignments (tenant_id, ticket_id);
CREATE INDEX idx_ticket_partner_assignments_partner ON ticket_partner_assignments (tenant_id, partner_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_partner_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY ticket_partner_assignments_select ON ticket_partner_assignments FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_partner_assignments_insert ON ticket_partner_assignments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_partner_assignments_update ON ticket_partner_assignments FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ticket_partner_assignments_delete ON ticket_partner_assignments FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. UPDATE get_current_tenant_id() to include partner_agents
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  -- First try agents table
  SELECT tenant_id INTO _tenant_id FROM agents WHERE user_id = auth.uid() LIMIT 1;
  IF _tenant_id IS NOT NULL THEN
    RETURN _tenant_id;
  END IF;

  -- Fallback to partner_agents table
  SELECT tenant_id INTO _tenant_id FROM partner_agents WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  RETURN _tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS ticket_partner_assignments CASCADE;
--   DROP TABLE IF EXISTS partner_agents CASCADE;
--   DROP TABLE IF EXISTS partners CASCADE;
--   -- Restore previous get_current_tenant_id() from 00002:
--   CREATE OR REPLACE FUNCTION get_current_tenant_id()
--   RETURNS uuid AS $$
--   DECLARE
--     _tenant_id uuid;
--   BEGIN
--     SELECT tenant_id INTO _tenant_id FROM agents WHERE user_id = auth.uid() LIMIT 1;
--     RETURN _tenant_id;
--   END;
--   $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
-- ═══════════════════════════════════════════════════════════════
