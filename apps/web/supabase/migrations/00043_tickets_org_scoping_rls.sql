-- 00031_tickets_org_scoping_rls.sql
--
-- Tightens RLS so non-staff users (readonly agents and portal users) can
-- only see tickets of organizations they're explicitly linked to. Before
-- this migration, tickets_select only checked tenant_id, which meant a
-- user from organization A could query Supabase directly and read every
-- ticket of organization B in the same tenant.
--
-- Application-layer guards in apps/web/app/home/tickets/* are also in
-- place, but the durable fix lives at the database so the REST API and
-- any future direct-DB clients are also covered.
--
-- Staff agents (admin/supervisor/agent) keep tenant-wide access — that
-- matches the existing OrgSelector behavior where staff can switch
-- between any org of the tenant.

-- ---------------------------------------------------------------
-- 1. Helper: is the current auth.uid() a staff agent?
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_staff_agent()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM agents
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'supervisor', 'agent')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_staff_agent() IS
  'True when the current authenticated user holds an active TDX-staff agents row. Readonly agents and portal users return false.';

-- ---------------------------------------------------------------
-- 2. Helper: does the current user have access to a given org?
--    Considers both organization_users (portal users) and
--    agent_organizations (readonly agents linked to a customer org).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_org_access(org_id uuid)
RETURNS boolean AS $$
  SELECT
    org_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM organization_users ou
        WHERE ou.user_id = auth.uid()
          AND ou.organization_id = org_id
          AND ou.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM agent_organizations ao
        JOIN agents a ON a.id = ao.agent_id
        WHERE a.user_id = auth.uid()
          AND a.is_active = true
          AND ao.organization_id = org_id
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION has_org_access(uuid) IS
  'True when the current authenticated user is explicitly linked to org_id via organization_users or agent_organizations.';

-- ---------------------------------------------------------------
-- 3. Replace tickets RLS policies
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND deleted_at IS NULL
    AND (
      is_staff_agent()
      OR has_org_access(organization_id)
    )
  );

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND deleted_at IS NULL
    AND (
      is_staff_agent()
      OR has_org_access(organization_id)
    )
  );

-- INSERT/DELETE stay tenant-scoped only. Insert is gated by the
-- application's createTicket which already enforces the org for clients;
-- delete is a staff-only operation in practice.
DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. Replace ticket_followups RLS so comments inherit the same scope
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS ticket_followups_select ON ticket_followups;
CREATE POLICY ticket_followups_select ON ticket_followups FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (
      is_staff_agent()
      OR EXISTS (
        SELECT 1 FROM tickets t
        WHERE t.id = ticket_followups.ticket_id
          AND has_org_access(t.organization_id)
      )
    )
  );

DROP POLICY IF EXISTS ticket_followups_insert ON ticket_followups;
CREATE POLICY ticket_followups_insert ON ticket_followups FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND (
      is_staff_agent()
      OR EXISTS (
        SELECT 1 FROM tickets t
        WHERE t.id = ticket_followups.ticket_id
          AND has_org_access(t.organization_id)
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration:
--   DROP POLICY IF EXISTS tickets_select ON tickets;
--   CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
--   DROP POLICY IF EXISTS tickets_update ON tickets;
--   CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
--     USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
--   DROP POLICY IF EXISTS ticket_followups_select ON ticket_followups;
--   CREATE POLICY ticket_followups_select ON ticket_followups FOR SELECT TO authenticated
--     USING (tenant_id = get_current_tenant_id());
--   DROP POLICY IF EXISTS ticket_followups_insert ON ticket_followups;
--   CREATE POLICY ticket_followups_insert ON ticket_followups FOR INSERT TO authenticated
--     WITH CHECK (tenant_id = get_current_tenant_id());
--   DROP FUNCTION IF EXISTS has_org_access(uuid);
--   DROP FUNCTION IF EXISTS is_staff_agent();
-- ═══════════════════════════════════════════════════════════════
