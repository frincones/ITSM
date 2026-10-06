-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00063: DAILY ACTIVITY AS A SQL FUNCTION
-- ═══════════════════════════════════════════════════════════════
-- The report's "tickets por día" chart showed 12 opened on 3 October — a date
-- that had not happened yet. Those twelve are the corrupted import rows that
-- 00062 already excludes from quota, SLA and compliance.
--
-- The chart escaped the guard because it was the one figure computed in
-- TypeScript: getDailyActivity queried ticket_status_history directly, and the
-- plausibility predicate lives in SQL. So the report's own numbers disagreed
-- with each other — the quota said 11 while the chart drew 25.
--
-- Moving it into SQL is the fix, and the reason is general: every contractual
-- figure belongs behind the same predicate, or the next guard added in one
-- place will silently miss the other.
--
-- Depends on: 00062 (ticket_dates_plausible), 00055 (support_cycle_for).

CREATE OR REPLACE FUNCTION support_cycle_daily_activity(
  p_contract_id uuid,
  p_at          date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  day      date,
  opened   integer,
  closed   integer
) AS $fn$
  WITH c AS (
    SELECT organization_id FROM organization_support_contracts WHERE id = p_contract_id
  ),
  cy AS (
    SELECT * FROM support_cycle_for(p_contract_id, p_at)
  )
  SELECT
    (h.changed_at AT TIME ZONE 'America/Bogota')::date,
    -- from_status NULL is the creation row written by the 00045 trigger.
    count(*) FILTER (WHERE h.from_status IS NULL)::integer,
    count(*) FILTER (WHERE h.to_status IN ('closed', 'resolved'))::integer
  FROM ticket_status_history h
  JOIN tickets t ON t.id = h.ticket_id
  CROSS JOIN cy
  WHERE h.organization_id = (SELECT organization_id FROM c)
    AND t.deleted_at IS NULL
    AND ticket_dates_plausible(t.created_at, t.updated_at)
    AND (h.changed_at AT TIME ZONE 'America/Bogota')::date
        BETWEEN cy.cycle_start AND cy.cycle_end
  GROUP BY 1
  ORDER BY 1;
$fn$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION support_cycle_daily_activity(uuid, date) IS
  'Tickets opened and closed per day within a billing cycle, excluding rows with impossible dates so the chart agrees with the quota count.';

GRANT EXECUTE ON FUNCTION support_cycle_daily_activity(uuid, date)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS support_cycle_daily_activity(uuid, date);
-- ═══════════════════════════════════════════════════════════════
