-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00006: SLA & OLA
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates calendars, SLA/OLA tables with levels and
--              actions, plus ALTER TABLE to add FKs to existing tables.
-- Depends on: 00005_problems_changes.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE sla_type AS ENUM ('response', 'resolution', 'update');

-- ---------------------------------------------------------------
-- 2. TABLE: calendars
-- ---------------------------------------------------------------

CREATE TABLE calendars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  timezone    text DEFAULT 'America/Bogota',
  is_default  boolean DEFAULT false,
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- RLS
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendars FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_calendars_tenant ON calendars (tenant_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY calendars_select ON calendars FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendars_insert ON calendars FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY calendars_update ON calendars FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendars_delete ON calendars FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: calendar_schedules
-- ---------------------------------------------------------------

CREATE TABLE calendar_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id   uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  day_of_week   integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, day_of_week)
);

-- RLS
ALTER TABLE calendar_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_schedules FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_calendar_schedules_tenant ON calendar_schedules (tenant_id);
CREATE INDEX idx_calendar_schedules_calendar ON calendar_schedules (calendar_id);

-- Policies
CREATE POLICY calendar_schedules_select ON calendar_schedules FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_schedules_insert ON calendar_schedules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_schedules_update ON calendar_schedules FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_schedules_delete ON calendar_schedules FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: calendar_holidays
-- ---------------------------------------------------------------

CREATE TABLE calendar_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id   uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  name          text NOT NULL,
  date          date NOT NULL,
  is_recurring  boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE calendar_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_holidays FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_calendar_holidays_tenant ON calendar_holidays (tenant_id);
CREATE INDEX idx_calendar_holidays_calendar ON calendar_holidays (calendar_id);
CREATE INDEX idx_calendar_holidays_date ON calendar_holidays (tenant_id, date);

-- Policies
CREATE POLICY calendar_holidays_select ON calendar_holidays FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_holidays_insert ON calendar_holidays FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_holidays_update ON calendar_holidays FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY calendar_holidays_delete ON calendar_holidays FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. TABLE: slas
-- ---------------------------------------------------------------

CREATE TABLE slas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text,
  type                  sla_type NOT NULL DEFAULT 'resolution',
  calendar_id           uuid REFERENCES calendars(id),
  target_critical       integer NOT NULL DEFAULT 60,
  target_high           integer NOT NULL DEFAULT 240,
  target_medium         integer NOT NULL DEFAULT 480,
  target_low            integer NOT NULL DEFAULT 1440,
  is_active             boolean DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- RLS
ALTER TABLE slas ENABLE ROW LEVEL SECURITY;
ALTER TABLE slas FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_slas_tenant ON slas (tenant_id);
CREATE INDEX idx_slas_tenant_active ON slas (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON slas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY slas_select ON slas FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY slas_insert ON slas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY slas_update ON slas FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY slas_delete ON slas FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 6. TABLE: sla_levels
-- ---------------------------------------------------------------

CREATE TABLE sla_levels (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sla_id            uuid NOT NULL REFERENCES slas(id) ON DELETE CASCADE,
  name              text NOT NULL,
  execution_time    integer NOT NULL,
  is_before_breach  boolean DEFAULT true,
  actions           jsonb DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE sla_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_levels FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_sla_levels_tenant ON sla_levels (tenant_id);
CREATE INDEX idx_sla_levels_sla ON sla_levels (sla_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sla_levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY sla_levels_select ON sla_levels FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY sla_levels_insert ON sla_levels FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY sla_levels_update ON sla_levels FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY sla_levels_delete ON sla_levels FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 7. TABLE: sla_level_actions
-- ---------------------------------------------------------------

CREATE TABLE sla_level_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sla_level_id      uuid NOT NULL REFERENCES sla_levels(id) ON DELETE CASCADE,
  action_type       text NOT NULL CHECK (action_type IN ('notify', 'escalate', 'reassign', 'webhook')),
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_order   integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE sla_level_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_level_actions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_sla_level_actions_tenant ON sla_level_actions (tenant_id);
CREATE INDEX idx_sla_level_actions_level ON sla_level_actions (sla_level_id);

-- Policies
CREATE POLICY sla_level_actions_select ON sla_level_actions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY sla_level_actions_insert ON sla_level_actions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY sla_level_actions_update ON sla_level_actions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY sla_level_actions_delete ON sla_level_actions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 8. TABLE: olas
-- ---------------------------------------------------------------

CREATE TABLE olas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text,
  type                  sla_type NOT NULL DEFAULT 'resolution',
  calendar_id           uuid REFERENCES calendars(id),
  target_critical       integer NOT NULL DEFAULT 30,
  target_high           integer NOT NULL DEFAULT 120,
  target_medium         integer NOT NULL DEFAULT 240,
  target_low            integer NOT NULL DEFAULT 480,
  is_active             boolean DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- RLS
ALTER TABLE olas ENABLE ROW LEVEL SECURITY;
ALTER TABLE olas FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_olas_tenant ON olas (tenant_id);
CREATE INDEX idx_olas_tenant_active ON olas (tenant_id, is_active) WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON olas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY olas_select ON olas FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY olas_insert ON olas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY olas_update ON olas FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY olas_delete ON olas FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 9. TABLE: ola_levels
-- ---------------------------------------------------------------

CREATE TABLE ola_levels (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ola_id            uuid NOT NULL REFERENCES olas(id) ON DELETE CASCADE,
  name              text NOT NULL,
  execution_time    integer NOT NULL,
  is_before_breach  boolean DEFAULT true,
  actions           jsonb DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ola_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ola_levels FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ola_levels_tenant ON ola_levels (tenant_id);
CREATE INDEX idx_ola_levels_ola ON ola_levels (ola_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ola_levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY ola_levels_select ON ola_levels FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ola_levels_insert ON ola_levels FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ola_levels_update ON ola_levels FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ola_levels_delete ON ola_levels FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 10. TABLE: ola_level_actions
-- ---------------------------------------------------------------

CREATE TABLE ola_level_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ola_level_id      uuid NOT NULL REFERENCES ola_levels(id) ON DELETE CASCADE,
  action_type       text NOT NULL CHECK (action_type IN ('notify', 'escalate', 'reassign', 'webhook')),
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_order   integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ola_level_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ola_level_actions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ola_level_actions_tenant ON ola_level_actions (tenant_id);
CREATE INDEX idx_ola_level_actions_level ON ola_level_actions (ola_level_id);

-- Policies
CREATE POLICY ola_level_actions_select ON ola_level_actions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ola_level_actions_insert ON ola_level_actions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ola_level_actions_update ON ola_level_actions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ola_level_actions_delete ON ola_level_actions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 11. ALTER TABLES: Add FK references now that SLA/OLA tables exist
-- ---------------------------------------------------------------

-- tickets.sla_id -> slas
ALTER TABLE tickets ADD CONSTRAINT tickets_sla_fkey
  FOREIGN KEY (sla_id) REFERENCES slas(id);

-- tickets.ola_id -> olas
ALTER TABLE tickets ADD CONSTRAINT tickets_ola_fkey
  FOREIGN KEY (ola_id) REFERENCES olas(id);

-- groups.sla_id -> slas
ALTER TABLE groups ADD CONSTRAINT groups_sla_fkey
  FOREIGN KEY (sla_id) REFERENCES slas(id);

-- groups.calendar_id -> calendars
ALTER TABLE groups ADD CONSTRAINT groups_calendar_fkey
  FOREIGN KEY (calendar_id) REFERENCES calendars(id);

-- categories.default_sla_id -> slas
ALTER TABLE categories ADD CONSTRAINT categories_default_sla_fkey
  FOREIGN KEY (default_sla_id) REFERENCES slas(id);

-- services.sla_id -> slas
ALTER TABLE services ADD CONSTRAINT services_sla_fkey
  FOREIGN KEY (sla_id) REFERENCES slas(id);

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   ALTER TABLE services DROP CONSTRAINT IF EXISTS services_sla_fkey;
--   ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_default_sla_fkey;
--   ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_calendar_fkey;
--   ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_sla_fkey;
--   ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ola_fkey;
--   ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_sla_fkey;
--   DROP TABLE IF EXISTS ola_level_actions CASCADE;
--   DROP TABLE IF EXISTS ola_levels CASCADE;
--   DROP TABLE IF EXISTS olas CASCADE;
--   DROP TABLE IF EXISTS sla_level_actions CASCADE;
--   DROP TABLE IF EXISTS sla_levels CASCADE;
--   DROP TABLE IF EXISTS slas CASCADE;
--   DROP TABLE IF EXISTS calendar_holidays CASCADE;
--   DROP TABLE IF EXISTS calendar_schedules CASCADE;
--   DROP TABLE IF EXISTS calendars CASCADE;
--   DROP TYPE IF EXISTS sla_type;
-- ═══════════════════════════════════════════════════════════════
