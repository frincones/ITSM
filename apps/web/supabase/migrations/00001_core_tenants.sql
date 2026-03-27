-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00001: CORE TENANTS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates shared helper functions, tenant ENUM types,
--              tenants table and tenant_settings table with full
--              RLS policies, indexes, and triggers.
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. HELPER FUNCTIONS
-- ---------------------------------------------------------------

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Stub function — will be replaced in 00002 after agents table exists.
-- Returns NULL until agents table is available.
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid AS $$
BEGIN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------
-- 2. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE tenant_plan AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('active', 'trial', 'suspended', 'cancelled');

-- ---------------------------------------------------------------
-- 3. TABLE: tenants (top-level entity)
-- ---------------------------------------------------------------

CREATE TABLE tenants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  domain              text UNIQUE,
  plan                tenant_plan NOT NULL DEFAULT 'free',
  logo_url            text,
  brand_colors        jsonb DEFAULT '{"primary":"#4f46e5","secondary":"#7c3aed","accent":"#06b6d4"}'::jsonb,
  settings            jsonb DEFAULT '{}'::jsonb,
  features_enabled    text[] DEFAULT '{}',
  max_agents          integer DEFAULT 5,
  max_ai_queries      integer DEFAULT 1000,
  ai_queries_used     integer DEFAULT 0,
  subscription_status tenant_status NOT NULL DEFAULT 'trial',
  trial_ends_at       timestamptz DEFAULT (now() + interval '14 days'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies: tenants are scoped by get_current_tenant_id()
-- For tenants table, the id IS the tenant_id
CREATE POLICY tenants_select ON tenants FOR SELECT TO authenticated
  USING (id = get_current_tenant_id());

CREATE POLICY tenants_insert ON tenants FOR INSERT TO authenticated
  WITH CHECK (id = get_current_tenant_id());

CREATE POLICY tenants_update ON tenants FOR UPDATE TO authenticated
  USING (id = get_current_tenant_id());

CREATE POLICY tenants_delete ON tenants FOR DELETE TO authenticated
  USING (id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: tenant_settings
-- ---------------------------------------------------------------

CREATE TABLE tenant_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  timezone                text DEFAULT 'America/Bogota',
  date_format             text DEFAULT 'DD/MM/YYYY',
  language                text DEFAULT 'es',
  ticket_prefix           text DEFAULT 'TKT',
  auto_assign             boolean DEFAULT true,
  require_category        boolean DEFAULT true,
  ai_auto_triage          boolean DEFAULT true,
  ai_auto_respond         boolean DEFAULT false,
  ai_confidence_threshold float DEFAULT 0.8,
  ai_model_preference     text DEFAULT 'claude-sonnet-4-6',
  notify_on_create        boolean DEFAULT true,
  notify_on_assign        boolean DEFAULT true,
  notify_on_update        boolean DEFAULT true,
  notify_on_close         boolean DEFAULT true,
  portal_enabled          boolean DEFAULT true,
  portal_ai_enabled       boolean DEFAULT true,
  portal_kb_enabled       boolean DEFAULT true,
  session_timeout         integer DEFAULT 480,
  mfa_required            boolean DEFAULT false,
  ip_whitelist            text[],
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS tenant_settings CASCADE;
--   DROP TABLE IF EXISTS tenants CASCADE;
--   DROP TYPE IF EXISTS tenant_status;
--   DROP TYPE IF EXISTS tenant_plan;
--   DROP FUNCTION IF EXISTS get_current_tenant_id();
--   DROP FUNCTION IF EXISTS update_updated_at();
-- ═══════════════════════════════════════════════════════════════
