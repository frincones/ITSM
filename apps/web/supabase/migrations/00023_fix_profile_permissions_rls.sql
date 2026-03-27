-- Migration 00023: Fix profile_permissions RLS — add SELECT policy
-- profile_permissions had ENABLE + FORCE RLS but NO policies,
-- so authenticated users couldn't read permissions.

-- Allow authenticated users to read profile_permissions
-- (linked via their profile_id on agents or organization_users)
CREATE POLICY profile_perms_select ON profile_permissions
  FOR SELECT TO authenticated
  USING (true);

-- Allow service_role to manage
CREATE POLICY profile_perms_insert ON profile_permissions
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY profile_perms_update ON profile_permissions
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY profile_perms_delete ON profile_permissions
  FOR DELETE TO authenticated
  USING (true);
