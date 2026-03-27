-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00003: RBAC PROFILES & PERMISSIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE permission_scope AS ENUM ('own', 'group', 'all');

CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_system     boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_profiles_tenant ON profiles (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id() AND is_system = false);

-- Add FK from agents to profiles
ALTER TABLE agents ADD CONSTRAINT agents_profile_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id);

CREATE TABLE profile_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resource      text NOT NULL,
  actions       text[] NOT NULL,
  scope         permission_scope NOT NULL DEFAULT 'own',
  conditions    jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, resource)
);

ALTER TABLE profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_permissions FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_profile_perms_profile ON profile_permissions (profile_id);

-- Groups
CREATE TABLE groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  parent_group_id     uuid REFERENCES groups(id),
  manager_agent_id    uuid REFERENCES agents(id),
  email               text,
  auto_assign         boolean DEFAULT false,
  auto_assign_method  text DEFAULT 'round_robin'
                      CHECK (auto_assign_method IN ('round_robin', 'least_busy', 'ai_smart')),
  calendar_id         uuid,  -- FK added later
  sla_id              uuid,  -- FK added later
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_groups_tenant ON groups (tenant_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY groups_select ON groups FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY groups_insert ON groups FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY groups_update ON groups FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY groups_delete ON groups FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE TABLE group_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role        text DEFAULT 'member' CHECK (role IN ('member', 'leader')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, agent_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
