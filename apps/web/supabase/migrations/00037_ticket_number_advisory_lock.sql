-- Two problems with the original generate_ticket_number() trigger:
--
-- 1. Race condition. Concurrent INSERTs (UI + Resend webhook + pg_cron
--    reconciler firing in the same minute) could both compute MAX+1 = N,
--    both try to insert ticket_number N, and the second hits
--    tickets_tenant_id_ticket_number_key.
--    Fix: pg_advisory_xact_lock keyed by tenant_id, serializing per-tenant
--    ticket_number generation. Released automatically at COMMIT/ROLLBACK.
--
-- 2. RLS-invisible deleted tickets. The trigger ran as the caller, so its
--    internal SELECT was filtered by the tickets_select policy (which
--    hides deleted_at IS NOT NULL). If a ticket with seq N was
--    soft-deleted, MAX()+1 would land back on N — but the unique
--    constraint still covers soft-deleted rows, so INSERT failed with
--    duplicate-key. This was the actual user-visible bug: after deleting
--    test tickets 503-517, every new ticket tried to take seq 503.
--    Fix: SECURITY DEFINER bypasses RLS, so the trigger sees all tickets
--    including soft-deleted ones.

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix text;
  seq_num integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ticket_number:' || NEW.tenant_id::text, 0)
  );

  SELECT ticket_prefix INTO prefix FROM tenant_settings WHERE tenant_id = NEW.tenant_id;
  IF prefix IS NULL THEN prefix := 'TKT'; END IF;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(ticket_number, '-', 3) AS integer)
  ), 0) + 1 INTO seq_num
  FROM tickets WHERE tenant_id = NEW.tenant_id;

  NEW.ticket_number := prefix || '-' || TO_CHAR(now(), 'YYMM') || '-' || LPAD(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog;
