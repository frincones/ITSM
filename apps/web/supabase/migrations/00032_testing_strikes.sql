-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00032: TESTING STRIKE PROCESS
-- ═══════════════════════════════════════════════════════════════
-- Tickets sitting in 'testing' drift because nobody is actively working
-- them — the agent already did their part and is waiting for the requester
-- to confirm the fix. We mirror the Zendesk "bump-bump-solve" pattern but
-- compressed to 3 days because MSP customers expect faster closure:
--
--   Strike 1 (24h in testing) → reminder email + in-app to requester
--   Strike 2 (48h in testing) → final warning to requester + agent/manager
--   Strike 3 (72h in testing) → auto-transition to 'resolved' (not closed,
--                                so the CSAT flow still runs and clients can
--                                still reopen)
--
-- Client replies alone do NOT reset the counter — the requester must
-- explicitly change status (a product decision to avoid cron churn on
-- noisy threads). The counter resets automatically when status leaves
-- 'testing' via the trigger below.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS testing_strikes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_testing_strike_at timestamptz;

-- Fast lookup for the cron: tickets currently in testing, sorted by how
-- long they've been there.
CREATE INDEX IF NOT EXISTS idx_tickets_testing_age
  ON tickets (tenant_id, status, ((custom_fields->>'testing_entered_at')::timestamptz))
  WHERE status = 'testing';

-- Reset strikes when the ticket leaves testing. We already clear
-- testing_entered_at in the application layer (tickets.ts changeTicketStatus),
-- but resetting strikes here guarantees consistency even for direct SQL or
-- admin edits that bypass the action.
CREATE OR REPLACE FUNCTION reset_testing_strikes_on_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'testing' AND NEW.status <> 'testing' THEN
    NEW.testing_strikes := 0;
    NEW.last_testing_strike_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_testing_strikes ON tickets;
CREATE TRIGGER trg_reset_testing_strikes
  BEFORE UPDATE OF status ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION reset_testing_strikes_on_status_change();
