-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00045: TICKET STATUS HISTORY + FRT BACKFILL
-- ═══════════════════════════════════════════════════════════════
-- Adds the missing instrumentation needed to compute SLA / time-in-status
-- / first-response-time / lifecycle metrics with rigor. Until now:
--   - tickets.first_response_at populated on only 9% of rows
--     (0.5% of closed tickets)
--   - No status history table → impossible to compute "time spent in
--     testing/pending/in_progress" or weekly lifecycle curves
--   - audit_logs has zero ticket rows so we can't backfill from it
--   - 80% of tickets are Excel imports with created_at == Excel date
--
-- Components:
--   1. ticket_status_history table (tenant + org scoped via RLS pattern
--      from migration 00043)
--   2. AFTER INSERT trigger on tickets → logs the initial status
--   3. AFTER UPDATE OF status trigger → logs every transition
--      regardless of which code path (UI action, cron, manual SQL, MCP)
--      caused the change. This is the same robustness pattern used for
--      the testing_strikes / testing_result cleanup in migration 00041.
--   4. One-shot backfill of ticket_status_history from the timestamps
--      we already have (created_at, first_response_at, resolved_at,
--      closed_at, updated_at as fallback).
--   5. One-shot backfill of tickets.first_response_at using the
--      earliest public reply from a staff agent in ticket_followups.

-- ---------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id            uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id      uuid REFERENCES organizations(id) ON DELETE SET NULL,
  from_status          ticket_status,
  to_status            ticket_status NOT NULL,
  changed_at           timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id   uuid,
  changed_by_agent_id  uuid,
  reason               text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_status_history IS
  'Append-only log of every ticket status transition. Populated by the trg_log_ticket_status_change / trg_log_ticket_creation triggers — never written directly from app code. Used for FRT / MTTR / time-in-status metrics.';

-- ---------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_status_history_ticket_changed
  ON ticket_status_history (ticket_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_status_history_tenant_changed
  ON ticket_status_history (tenant_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_history_tenant_to_status_changed
  ON ticket_status_history (tenant_id, to_status, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_history_tenant_org_changed
  ON ticket_status_history (tenant_id, organization_id, changed_at DESC)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. RLS — SELECT only; writes go exclusively through triggers
-- ---------------------------------------------------------------
ALTER TABLE ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_status_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_history_select ON ticket_status_history;
CREATE POLICY status_history_select ON ticket_status_history FOR SELECT TO authenticated
  USING (
    tenant_id = get_current_tenant_id()
    AND (
      -- Staff agents see everything in the tenant
      EXISTS (
        SELECT 1 FROM agents a
        WHERE a.user_id = auth.uid()
          AND a.is_active = true
          AND a.role IN ('admin', 'supervisor', 'agent')
      )
      -- Clients only see history for tickets in orgs they belong to
      OR organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = true
      )
      OR organization_id IN (
        SELECT ao.organization_id
        FROM agent_organizations ao
        JOIN agents a ON a.id = ao.agent_id
        WHERE a.user_id = auth.uid() AND a.is_active = true
      )
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated. The triggers run
-- as SECURITY DEFINER and bypass RLS. Direct writes are blocked by the
-- absence of policies + FORCE ROW LEVEL SECURITY.

-- ---------------------------------------------------------------
-- 4. TRIGGER FUNCTIONS
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_ticket_creation()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agent_id uuid;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE user_id = v_user_id LIMIT 1;
  END IF;

  INSERT INTO ticket_status_history(
    ticket_id, tenant_id, organization_id,
    from_status, to_status,
    changed_at, changed_by_user_id, changed_by_agent_id,
    reason
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.organization_id,
    NULL, NEW.status,
    NEW.created_at, v_user_id, v_agent_id,
    'created'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agent_id uuid;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents WHERE user_id = v_user_id LIMIT 1;
  END IF;

  INSERT INTO ticket_status_history(
    ticket_id, tenant_id, organization_id,
    from_status, to_status,
    changed_at, changed_by_user_id, changed_by_agent_id
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.organization_id,
    OLD.status, NEW.status,
    now(), v_user_id, v_agent_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------
-- 5. TRIGGERS
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_ticket_creation ON tickets;
CREATE TRIGGER trg_log_ticket_creation
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_creation();

DROP TRIGGER IF EXISTS trg_log_ticket_status_change ON tickets;
CREATE TRIGGER trg_log_ticket_status_change
  AFTER UPDATE OF status ON tickets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_ticket_status_change();

-- ---------------------------------------------------------------
-- 6. BACKFILL — ticket_status_history from existing timestamps
-- ---------------------------------------------------------------
-- Every ticket gets a "created → new" row at created_at.
INSERT INTO ticket_status_history(
  ticket_id, tenant_id, organization_id, from_status, to_status, changed_at, reason
)
SELECT id, tenant_id, organization_id, NULL, 'new', created_at, 'backfill-created'
FROM tickets
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_status_history h
  WHERE h.ticket_id = tickets.id AND h.reason = 'backfill-created'
);

-- Tickets with first_response_at get an approximate transition into in_progress.
INSERT INTO ticket_status_history(
  ticket_id, tenant_id, organization_id, from_status, to_status, changed_at, reason
)
SELECT id, tenant_id, organization_id, 'new', 'in_progress', first_response_at, 'backfill-frt'
FROM tickets
WHERE first_response_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_status_history h
    WHERE h.ticket_id = tickets.id AND h.reason = 'backfill-frt'
  );

-- Tickets with resolved_at get a transition into resolved.
INSERT INTO ticket_status_history(
  ticket_id, tenant_id, organization_id, from_status, to_status, changed_at, reason
)
SELECT id, tenant_id, organization_id, NULL, 'resolved', resolved_at, 'backfill-resolved'
FROM tickets
WHERE resolved_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_status_history h
    WHERE h.ticket_id = tickets.id AND h.reason = 'backfill-resolved'
  );

-- Tickets with closed_at get a transition into closed.
INSERT INTO ticket_status_history(
  ticket_id, tenant_id, organization_id, from_status, to_status, changed_at, reason
)
SELECT id, tenant_id, organization_id, NULL, 'closed', closed_at, 'backfill-closed'
FROM tickets
WHERE closed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_status_history h
    WHERE h.ticket_id = tickets.id AND h.reason = 'backfill-closed'
  );

-- Tickets whose CURRENT status isn't covered by the timestamps above get
-- a final-state row at updated_at so charts don't show them as "stuck in
-- new". Skips status='new' (already covered by created_at row) and any
-- status already represented.
INSERT INTO ticket_status_history(
  ticket_id, tenant_id, organization_id, from_status, to_status, changed_at, reason
)
SELECT id, tenant_id, organization_id, NULL, status, updated_at, 'backfill-current'
FROM tickets t
WHERE status NOT IN ('new', 'resolved', 'closed')
  AND NOT EXISTS (
    SELECT 1 FROM ticket_status_history h
    WHERE h.ticket_id = t.id AND h.to_status = t.status
  );

-- ---------------------------------------------------------------
-- 7. BACKFILL — tickets.first_response_at from earliest staff reply
-- ---------------------------------------------------------------
-- ITIL definition: first PUBLIC reply from a staff agent
-- (admin/supervisor/agent — not readonly, not portal). The
-- ticket_followups.author_type='agent' filter + role join enforces both.
WITH first_staff_reply AS (
  SELECT
    f.ticket_id,
    MIN(f.created_at) AS first_at
  FROM ticket_followups f
  JOIN agents a ON a.user_id = f.author_id
  WHERE f.is_private = false
    AND f.author_type = 'agent'
    AND a.role IN ('admin', 'supervisor', 'agent')
  GROUP BY f.ticket_id
)
UPDATE tickets t
SET first_response_at = fsr.first_at
FROM first_staff_reply fsr
WHERE t.id = fsr.ticket_id
  AND t.first_response_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- The first_response_at backfill is data-only — to revert, set the
-- backfilled rows back to NULL by joining ticket_followups again.
-- The status_history table itself can be dropped cleanly:
--
--   DROP TRIGGER IF EXISTS trg_log_ticket_status_change ON tickets;
--   DROP TRIGGER IF EXISTS trg_log_ticket_creation ON tickets;
--   DROP FUNCTION IF EXISTS log_ticket_status_change();
--   DROP FUNCTION IF EXISTS log_ticket_creation();
--   DROP TABLE IF EXISTS ticket_status_history;
--
-- The backfill rows are tagged with reason LIKE 'backfill-%' so a
-- targeted DELETE can wipe them without losing live transitions
-- captured by the trigger after this migration runs.
-- ═══════════════════════════════════════════════════════════════
