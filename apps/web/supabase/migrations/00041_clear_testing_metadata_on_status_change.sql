-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00041: CLEAR TESTING METADATA WHEN LEAVING TESTING
-- ═══════════════════════════════════════════════════════════════
-- Problem: the trigger from 00032 (reset_testing_strikes_on_status_change)
-- resets the strike counter when a ticket leaves status='testing', but it
-- leaves `custom_fields.testing_result` and `custom_fields.testing_entered_at`
-- untouched. The application-layer cleanup in changeTicketStatus DOES clear
-- those keys, but the testing-strike-check cron auto-resolves tickets via a
-- direct UPDATE that bypasses changeTicketStatus — so the metadata stays
-- "stuck" on resolved tickets, polluting the "Casos Fracaso Testing" report
-- (we found 48 orphan rows in production).
--
-- Moving the cleanup into the trigger guarantees consistency across every
-- writer (UI server action, cron, manual SQL, future endpoints).

CREATE OR REPLACE FUNCTION reset_testing_strikes_on_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'testing' AND NEW.status <> 'testing' THEN
    NEW.testing_strikes := 0;
    NEW.last_testing_strike_at := NULL;
    -- Strip testing sub-state from custom_fields. Using `-` (jsonb minus
    -- text) is a no-op when the key is absent, so this is safe even on
    -- rows that never had the field set.
    IF NEW.custom_fields IS NOT NULL THEN
      NEW.custom_fields := NEW.custom_fields
        - 'testing_result'
        - 'testing_entered_at';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- One-shot cleanup of the existing orphan rows. Tickets currently NOT in
-- 'testing' shouldn't carry testing_result / testing_entered_at keys.
UPDATE tickets
SET custom_fields = custom_fields - 'testing_result' - 'testing_entered_at',
    testing_strikes = 0,
    last_testing_strike_at = NULL
WHERE status <> 'testing'
  AND (custom_fields ? 'testing_result' OR custom_fields ? 'testing_entered_at');

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- The trigger body had only the testing_strikes / last_testing_strike_at
-- resets before this migration. To revert:
--
--   CREATE OR REPLACE FUNCTION reset_testing_strikes_on_status_change()
--   RETURNS trigger AS $$
--   BEGIN
--     IF OLD.status = 'testing' AND NEW.status <> 'testing' THEN
--       NEW.testing_strikes := 0;
--       NEW.last_testing_strike_at := NULL;
--     END IF;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
-- The one-shot UPDATE is not reversible (data was already conceptually
-- garbage); restoring it would require a backup.
-- ═══════════════════════════════════════════════════════════════
