-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00022: RBAC MODULES & PERMISSIONS SEED
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Adds enabled_modules to organizations, profile_id
--              to organization_users, and seeds profile_permissions
--              for existing profiles (Admin, Agent L1, Agent L2).
-- Depends on: 00021_organizations.sql
-- ZERO regression: only ADD COLUMN + INSERT, no modify/delete
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ADD enabled_modules to organizations (ALL modules as default)
-- ---------------------------------------------------------------

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enabled_modules text[]
  DEFAULT ARRAY['dashboard','tickets','problems','changes','kb','inbox',
                'reports','assets','projects','service_catalog','automations',
                'workflows','settings','notifications'];

-- ---------------------------------------------------------------
-- 2. ADD profile_id to organization_users (nullable, no impact)
-- ---------------------------------------------------------------

ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  profile_id uuid REFERENCES profiles(id);

-- ---------------------------------------------------------------
-- 3. SEED profile_permissions for existing profiles
-- ---------------------------------------------------------------

DO $$
DECLARE
  v_admin_id uuid;
  v_agent_l1_id uuid;
  v_agent_l2_id uuid;
  v_tenant_id uuid := '8be06573-2e43-4d8f-b81d-48b9cddb060d';
BEGIN
  -- Get profile IDs
  SELECT id INTO v_admin_id FROM profiles WHERE name = 'Admin' AND tenant_id = v_tenant_id LIMIT 1;
  SELECT id INTO v_agent_l1_id FROM profiles WHERE name = 'Agent L1' AND tenant_id = v_tenant_id LIMIT 1;
  SELECT id INTO v_agent_l2_id FROM profiles WHERE name = 'Agent L2' AND tenant_id = v_tenant_id LIMIT 1;

  -- ----- Admin: full access to everything -----
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO profile_permissions (profile_id, resource, actions, scope) VALUES
      (v_admin_id, 'dashboard',       '{read}',                                  'all'),
      (v_admin_id, 'tickets',         '{create,read,update,delete,assign,close}', 'all'),
      (v_admin_id, 'problems',        '{create,read,update,delete}',             'all'),
      (v_admin_id, 'changes',         '{create,read,update,delete,approve}',     'all'),
      (v_admin_id, 'kb',              '{create,read,update,delete,publish}',     'all'),
      (v_admin_id, 'inbox',           '{read,reply,assign,resolve}',             'all'),
      (v_admin_id, 'reports',         '{read,export}',                           'all'),
      (v_admin_id, 'assets',          '{create,read,update,delete}',             'all'),
      (v_admin_id, 'projects',        '{create,read,update,delete}',             'all'),
      (v_admin_id, 'settings',        '{read,update}',                           'all'),
      (v_admin_id, 'notifications',   '{read,update}',                           'all'),
      (v_admin_id, 'automations',     '{create,read,update,delete}',             'all'),
      (v_admin_id, 'workflows',       '{create,read,update,delete}',             'all'),
      (v_admin_id, 'service_catalog', '{create,read,update,delete}',             'all'),
      (v_admin_id, 'organizations',   '{create,read,update,delete}',             'all')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ----- Agent L1: limited access -----
  IF v_agent_l1_id IS NOT NULL THEN
    INSERT INTO profile_permissions (profile_id, resource, actions, scope) VALUES
      (v_agent_l1_id, 'dashboard',       '{read}',        'all'),
      (v_agent_l1_id, 'tickets',         '{create,read,update}', 'own'),
      (v_agent_l1_id, 'problems',        '{read}',        'all'),
      (v_agent_l1_id, 'changes',         '{read}',        'all'),
      (v_agent_l1_id, 'kb',              '{read}',        'all'),
      (v_agent_l1_id, 'inbox',           '{read,reply}',  'own'),
      (v_agent_l1_id, 'reports',         '{read}',        'all'),
      (v_agent_l1_id, 'notifications',   '{read}',        'all'),
      (v_agent_l1_id, 'service_catalog', '{read}',        'all')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ----- Agent L2: intermediate access -----
  IF v_agent_l2_id IS NOT NULL THEN
    INSERT INTO profile_permissions (profile_id, resource, actions, scope) VALUES
      (v_agent_l2_id, 'dashboard',       '{read}',              'all'),
      (v_agent_l2_id, 'tickets',         '{create,read,update,close}', 'group'),
      (v_agent_l2_id, 'problems',        '{create,read,update}', 'group'),
      (v_agent_l2_id, 'changes',         '{create,read,update}', 'own'),
      (v_agent_l2_id, 'kb',              '{create,read,update}', 'all'),
      (v_agent_l2_id, 'inbox',           '{read,reply,assign}',  'group'),
      (v_agent_l2_id, 'reports',         '{read}',              'all'),
      (v_agent_l2_id, 'assets',          '{read,update}',       'all'),
      (v_agent_l2_id, 'projects',        '{read}',              'all'),
      (v_agent_l2_id, 'notifications',   '{read}',              'all'),
      (v_agent_l2_id, 'service_catalog', '{read}',              'all')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   -- Remove seeded profile_permissions (only the ones inserted above)
--   DELETE FROM profile_permissions
--     WHERE resource IN (
--       'dashboard','tickets','problems','changes','kb','inbox',
--       'reports','assets','projects','settings','notifications',
--       'automations','workflows','service_catalog','organizations'
--     )
--     AND profile_id IN (
--       SELECT id FROM profiles
--       WHERE name IN ('Admin','Agent L1','Agent L2')
--         AND tenant_id = '8be06573-2e43-4d8f-b81d-48b9cddb060d'
--     );
--
--   -- Remove added columns
--   ALTER TABLE organization_users DROP COLUMN IF EXISTS profile_id;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS enabled_modules;
-- ═══════════════════════════════════════════════════════════════
