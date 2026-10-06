-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00061: KEEP sla_due_date CONSISTENT WITH sla_applies
-- ═══════════════════════════════════════════════════════════════
-- Found while checking why eight tickets in cycle 1 report "sin SLA": 70 rows
-- carry a sla_due_date while sla_applies is false, 61 of them created long
-- before the contract existed — the oldest due date is June 2025.
--
-- So sla_due_date was NOT empty before this series, contrary to what the
-- earlier migrations assumed. Nothing in the CURRENT codebase writes it, but
-- something historically did: an older code path, a manual fix, or the Excel
-- import. The column had simply stopped being maintained.
--
-- Compliance is unaffected — every calculation filters on sla_applies, so
-- those rows are correctly excluded. The damage is cosmetic but misleading:
-- the ticket detail draws its SLA badge from `sla_due_date ? ... : 'No SLA'`,
-- so a warranty ticket with a stale 2025 deadline would display an SLA it
-- never had.
--
-- Fixed at the cause rather than by scrubbing data:
--   · the stamp trigger now clears sla_due_date when no SLA is owed, so new
--     and reclassified tickets stay consistent
--   · the legacy values are LEFT IN PLACE. They are of unknown provenance and
--     deleting them would destroy the only record that something once wrote
--     them. The UI reads sla_applies instead (see ticket-detail-client.tsx).
--
-- Depends on: 00053 (stamp_ticket_sla), 00060.

CREATE OR REPLACE FUNCTION stamp_ticket_sla()
RETURNS trigger AS $fn$
DECLARE
  v_contract organization_support_contracts;
  v_minutes  integer;
  v_same_day boolean;
  v_opened   timestamptz := coalesce(NEW.created_at, now());
  v_due      timestamptz;
BEGIN
  -- Default to "no SLA owed". sla_due_date is cleared too: leaving a deadline
  -- on a ticket that owes none is what produced the 70 inconsistent rows this
  -- migration documents.
  NEW.sla_applies        := false;
  NEW.sla_contract_id    := NULL;
  NEW.sla_target_minutes := NULL;
  NEW.sla_due_date       := NULL;
  NEW.mitigation_due_at  := NULL;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT ticket_type_counts_for_sla(NEW.type) THEN
    RETURN NEW;
  END IF;

  v_contract := support_contract_at(
    NEW.organization_id,
    (v_opened AT TIME ZONE 'America/Bogota')::date
  );

  IF v_contract.id IS NULL
     OR NOT v_contract.sla_enabled
     OR v_contract.calendar_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT first_response_minutes, mitigation_same_day
    INTO v_minutes, v_same_day
  FROM support_contract_targets
  WHERE contract_id = v_contract.id AND severity = NEW.urgency;

  -- A contract in force with no target for this severity is a
  -- misconfiguration, not an exemption: we never claim compliance against a
  -- target that was never agreed.
  IF v_minutes IS NULL THEN
    RETURN NEW;
  END IF;

  v_due := add_business_minutes(v_contract.calendar_id, v_opened, v_minutes);
  IF v_due IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.sla_applies        := true;
  NEW.sla_contract_id    := v_contract.id;
  NEW.sla_target_minutes := v_minutes;
  NEW.sla_due_date       := v_due;

  IF v_same_day THEN
    NEW.mitigation_due_at :=
      end_of_business_day(v_contract.calendar_id, v_opened);
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- A sanity view so the inconsistency stays visible instead of being forgotten.
CREATE OR REPLACE VIEW sla_due_date_orphans AS
  SELECT id, ticket_number, type, status, organization_id,
         created_at, sla_due_date
  FROM tickets
  WHERE sla_due_date IS NOT NULL
    AND NOT sla_applies
    AND deleted_at IS NULL;

COMMENT ON VIEW sla_due_date_orphans IS
  'Tickets carrying a sla_due_date while owing no SLA — legacy rows from before the contract existed. Harmless for compliance (every calculation filters on sla_applies) but the UI must not read sla_due_date as proof of an SLA.';

GRANT SELECT ON sla_due_date_orphans TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
--   DROP VIEW IF EXISTS sla_due_date_orphans;
--   -- restore the 00053 body of stamp_ticket_sla (without the sla_due_date reset)
-- ═══════════════════════════════════════════════════════════════
