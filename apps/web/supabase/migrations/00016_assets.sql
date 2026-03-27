-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00016: ASSETS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates asset_types, assets, and asset_assignments
--              tables with full RLS policies, indexes, and triggers.
-- Depends on: 00015_projects.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: asset_types
-- ---------------------------------------------------------------

CREATE TABLE asset_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  icon        text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_types FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_asset_types_tenant ON asset_types (tenant_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY asset_types_select ON asset_types FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY asset_types_insert ON asset_types FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY asset_types_update ON asset_types FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY asset_types_delete ON asset_types FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: assets
-- ---------------------------------------------------------------

CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_tag       text NOT NULL,
  name            text NOT NULL,
  asset_type_id   uuid REFERENCES asset_types(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired', 'lost')),
  serial_number   text,
  purchase_date   date,
  purchase_cost   decimal(12,2),
  location        text,
  assigned_to     uuid REFERENCES agents(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, asset_tag)
);

-- RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_assets_tenant ON assets (tenant_id);
CREATE INDEX idx_assets_tenant_status ON assets (tenant_id, status);
CREATE INDEX idx_assets_tenant_type ON assets (tenant_id, asset_type_id);
CREATE INDEX idx_assets_tenant_assigned ON assets (tenant_id, assigned_to);
CREATE INDEX idx_assets_serial ON assets (tenant_id, serial_number) WHERE serial_number IS NOT NULL;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY assets_select ON assets FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY assets_insert ON assets FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY assets_update ON assets FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY assets_delete ON assets FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: asset_assignments
-- ---------------------------------------------------------------

CREATE TABLE asset_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_asset_assignments_tenant ON asset_assignments (tenant_id);
CREATE INDEX idx_asset_assignments_asset ON asset_assignments (tenant_id, asset_id);
CREATE INDEX idx_asset_assignments_agent ON asset_assignments (tenant_id, agent_id);

-- Policies
CREATE POLICY asset_assignments_select ON asset_assignments FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY asset_assignments_insert ON asset_assignments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY asset_assignments_update ON asset_assignments FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY asset_assignments_delete ON asset_assignments FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS asset_assignments CASCADE;
--   DROP TABLE IF EXISTS assets CASCADE;
--   DROP TABLE IF EXISTS asset_types CASCADE;
-- ═══════════════════════════════════════════════════════════════
