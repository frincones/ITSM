-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00050: P0 MITIGATION + CORRECTION PLAN COMMITMENTS
-- ═══════════════════════════════════════════════════════════════
-- Clause 4 of the Podenza support contract carries TWO commitments beyond the
-- response-time SLA, and neither had anywhere to live:
--
--   "Para incidentes P0 (críticos), TDX entregará una mitigación o solución
--    temporal dentro de la misma jornada hábil; para P0 y P1, un plan de
--    corrección con fecha comprometida dentro del mismo plazo de respuesta."
--
-- So:
--   · P0      → mitigation or workaround, by the close of the same business day
--   · P0 + P1 → a correction plan WITH a committed date, inside the response
--               SLA window
--
-- Both are verifiable by the client and independently breachable. Until now
-- ITSM had no field for either, which means that if the client asked "what
-- correction date did you commit on ticket X?" there was no answer in the
-- system — only somebody's inbox.
--
-- These are recorded commitments, not derived metrics: an agent states them
-- explicitly, and the timestamp of that statement is the evidence.
--
-- Depends on: 00048 (support contracts — targets.mitigation_same_day marks
-- which severities carry the mitigation duty).

-- ---------------------------------------------------------------
-- 1. COLUMNS
-- ---------------------------------------------------------------
ALTER TABLE tickets
  -- P0 mitigation / temporary solution
  ADD COLUMN IF NOT EXISTS mitigation_due_at         timestamptz,
  ADD COLUMN IF NOT EXISTS mitigation_at             timestamptz,
  ADD COLUMN IF NOT EXISTS mitigation_note           text,
  -- P0 + P1 correction plan
  ADD COLUMN IF NOT EXISTS correction_plan_at        timestamptz,
  ADD COLUMN IF NOT EXISTS correction_committed_date date,
  ADD COLUMN IF NOT EXISTS correction_plan_note      text;

COMMENT ON COLUMN tickets.mitigation_due_at IS
  'Close of the business day the ticket was opened in (rolled forward for out-of-hours arrivals). Frozen at creation so closed-cycle reports stay reproducible. NULL when the severity carries no mitigation duty.';

COMMENT ON COLUMN tickets.mitigation_at IS
  'When a mitigation or temporary solution was actually delivered to the client. Contract cl. 4, P0 only.';

COMMENT ON COLUMN tickets.correction_committed_date IS
  'The correction date TDX committed to the client. Contract cl. 4, P0 and P1. This is a promise made to the client, not an internal estimate.';

-- A note is the evidence that the commitment was communicated, so neither
-- timestamp may be set without one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_mitigation_needs_note'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_mitigation_needs_note
      CHECK (mitigation_at IS NULL OR btrim(coalesce(mitigation_note, '')) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_correction_plan_complete'
  ) THEN
    -- A correction plan without a committed date is not a correction plan —
    -- the committed date IS the commitment the contract asks for.
    ALTER TABLE tickets ADD CONSTRAINT tickets_correction_plan_complete
      CHECK (
        correction_plan_at IS NULL
        OR (correction_committed_date IS NOT NULL
            AND btrim(coalesce(correction_plan_note, '')) <> '')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. INDEXES — "what do we still owe?" queries
-- ---------------------------------------------------------------
-- Outstanding mitigations, soonest deadline first.
CREATE INDEX IF NOT EXISTS idx_tickets_mitigation_outstanding
  ON tickets (tenant_id, mitigation_due_at)
  WHERE mitigation_at IS NULL
    AND mitigation_due_at IS NOT NULL
    AND deleted_at IS NULL;

-- P0/P1 still missing a correction plan.
CREATE INDEX IF NOT EXISTS idx_tickets_correction_plan_pending
  ON tickets (tenant_id, urgency, created_at)
  WHERE correction_plan_at IS NULL
    AND urgency IN ('critical', 'high')
    AND deleted_at IS NULL;

-- Committed dates coming due, for the monthly report and for chasing.
CREATE INDEX IF NOT EXISTS idx_tickets_correction_committed
  ON tickets (tenant_id, correction_committed_date)
  WHERE correction_committed_date IS NOT NULL
    AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 3. HELPER: are the clause-4 commitments met?
-- ---------------------------------------------------------------
-- Returns one row per ticket describing both commitments. Deliberately
-- reports 'not_applicable' rather than 'met' where a duty does not exist —
-- same rule as sla_applies_for_ticket in 00048: never claim compliance with
-- something that was never owed.
CREATE OR REPLACE FUNCTION ticket_clause4_status(p_ticket_id uuid)
RETURNS TABLE (
  mitigation_status      text,
  mitigation_late_by     interval,
  correction_plan_status text
) AS $$
  SELECT
    CASE
      WHEN t.mitigation_due_at IS NULL            THEN 'not_applicable'
      WHEN t.mitigation_at IS NULL
           AND now() <= t.mitigation_due_at        THEN 'pending'
      WHEN t.mitigation_at IS NULL                THEN 'breached'
      WHEN t.mitigation_at <= t.mitigation_due_at THEN 'met'
      ELSE 'breached'
    END,
    CASE
      WHEN t.mitigation_due_at IS NULL THEN NULL
      WHEN t.mitigation_at IS NULL     THEN greatest(now() - t.mitigation_due_at, interval '0')
      ELSE greatest(t.mitigation_at - t.mitigation_due_at, interval '0')
    END,
    CASE
      WHEN t.urgency NOT IN ('critical', 'high') THEN 'not_applicable'
      WHEN t.correction_plan_at IS NOT NULL      THEN 'recorded'
      ELSE 'pending'
    END
  FROM tickets t
  WHERE t.id = p_ticket_id;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION ticket_clause4_status(uuid) IS
  'Status of the two clause-4 commitments (P0 mitigation, P0/P1 correction plan) for one ticket. "not_applicable" means no duty existed — never conflate with "met".';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS ticket_clause4_status(uuid);
--   DROP INDEX IF EXISTS idx_tickets_correction_committed;
--   DROP INDEX IF EXISTS idx_tickets_correction_plan_pending;
--   DROP INDEX IF EXISTS idx_tickets_mitigation_outstanding;
--   ALTER TABLE tickets
--     DROP CONSTRAINT IF EXISTS tickets_correction_plan_complete,
--     DROP CONSTRAINT IF EXISTS tickets_mitigation_needs_note,
--     DROP COLUMN IF EXISTS correction_plan_note,
--     DROP COLUMN IF EXISTS correction_committed_date,
--     DROP COLUMN IF EXISTS correction_plan_at,
--     DROP COLUMN IF EXISTS mitigation_note,
--     DROP COLUMN IF EXISTS mitigation_at,
--     DROP COLUMN IF EXISTS mitigation_due_at;
-- ═══════════════════════════════════════════════════════════════
