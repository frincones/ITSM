-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00051: SLA STAMP ON TICKETS
-- ═══════════════════════════════════════════════════════════════
-- The piece that finally makes SLA measurable. Until now tickets.sla_due_date
-- was NULL on every row because nothing ever computed it: /api/cron/sla-check
-- filtered on `sla_due_date IS NOT NULL` and therefore matched zero rows, and
-- the job was never even scheduled in pg_cron.
--
-- Three columns are added, and tickets.sla_due_date (which already exists and
-- is already read by the ticket list's "overdue" tab, the detail badge and the
-- home widget) is finally populated. Reusing it rather than adding sla_due_at
-- means every existing read path lights up with no further change.
--
-- WHY THE VALUES ARE FROZEN AT CREATION
-- The monthly report drives service credits (contract cl. 5), so a closed
-- cycle's numbers must never move. If the target were resolved on read, then
-- changing Podenza's plan from Professional to Business in March would silently
-- re-measure January's tickets against Business targets. The contract is
-- explicit that the applicable SLA is the plan in force THAT month (cl. 6), so
-- the plan that governed a ticket is recorded on the ticket.
--
-- WHAT sla_due_date DOES AND DOESN'T ACCOUNT FOR
-- It is the response deadline computed over business hours only (cl. 4:
-- Mon-Fri 08:00-17:00 America/Bogota, excluding holidays). It does NOT include
-- pause time: the contract also suspends the clock while a ticket waits on the
-- client, and those intervals are only knowable after the fact. Compliance is
-- therefore:
--
--     first_response_at <= sla_due_date + paused_business_minutes
--
-- with the paused minutes derived from ticket_status_history (00048/00049).
-- Keeping the stamp pause-free is what makes it freezable.
--
-- Columns and indexes only. The business-hour arithmetic and the stamping
-- trigger land in 00053; the compliance helpers in 00054.
--
-- Depends on: 00048 (organization_support_contracts).

-- ---------------------------------------------------------------
-- 1. COLUMNS
-- ---------------------------------------------------------------
ALTER TABLE tickets
  -- FALSE means EXCLUDED from the compliance denominator — never "met".
  -- Defaults to FALSE so any row created by a path that has not been taught to
  -- stamp (an import, direct SQL) stays out of the client's numbers rather
  -- than quietly counting as a success.
  ADD COLUMN IF NOT EXISTS sla_applies        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_contract_id    uuid
    REFERENCES organization_support_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_target_minutes integer
    CHECK (sla_target_minutes IS NULL OR sla_target_minutes > 0);

COMMENT ON COLUMN tickets.sla_applies IS
  'Whether this ticket carries a contractual response SLA. FALSE = excluded from the denominator, never counted as met. Set at creation via sla_applies_for_ticket().';

COMMENT ON COLUMN tickets.sla_contract_id IS
  'The support contract that governed this ticket. Frozen so a later plan change cannot re-measure a closed cycle.';

COMMENT ON COLUMN tickets.sla_target_minutes IS
  'Response target in business minutes, frozen from the contract targets at creation.';

-- ---------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------
-- The compliance query: measurable tickets in a cycle, by client.
CREATE INDEX IF NOT EXISTS idx_tickets_sla_measurable
  ON tickets (tenant_id, organization_id, created_at DESC)
  WHERE sla_applies = true AND deleted_at IS NULL;

-- What the sla-check cron scans: open tickets with a deadline and no response
-- yet. Narrow on purpose — this runs every 15 minutes and the pg_cron HTTP
-- jobs are what drained the Disk IO budget before 00046.
CREATE INDEX IF NOT EXISTS idx_tickets_sla_pending_response
  ON tickets (sla_due_date)
  WHERE sla_applies = true
    AND first_response_at IS NULL
    AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP INDEX IF EXISTS idx_tickets_sla_pending_response;
--   DROP INDEX IF EXISTS idx_tickets_sla_measurable;
--   ALTER TABLE tickets
--     DROP COLUMN IF EXISTS sla_target_minutes,
--     DROP COLUMN IF EXISTS sla_contract_id,
--     DROP COLUMN IF EXISTS sla_applies;
--
-- tickets.sla_due_date is left alone — it predates this migration. To undo the
-- population: UPDATE tickets SET sla_due_date = NULL WHERE sla_contract_id IS NOT NULL;
-- ═══════════════════════════════════════════════════════════════
