-- ---------------------------------------------------------------------------
-- 00089 · Realtime: stop the postgres_changes WAL poller
-- ---------------------------------------------------------------------------
-- Second half of 00088. Apply ONLY AFTER the client that listens on
-- Broadcast is deployed: the previous build relies on postgres_changes to
-- show an agent's own reply in the ticket timeline (addFollowup skips
-- revalidatePath) and to raise notification toasts. Applying this before the
-- deploy silently breaks both.
--
-- With no table left in the publication, postgres_changes has nothing to
-- poll. Any stale tab still subscribing simply receives no events.
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime DROP TABLE public.tickets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ticket_followups;
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;

-- 00038 set FULL so UPDATE events carried the whole row. Nothing reads the
-- WAL for tickets anymore; 00044 already returned it to DEFAULT on prod —
-- restated here so a fresh database ends in the same state.
ALTER TABLE public.tickets REPLICA IDENTITY DEFAULT;

-- ---------------------------------------------------------------------------
-- Rollback (restores live events for a client build on postgres_changes):
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets,
--     public.ticket_followups, public.notifications;
-- ---------------------------------------------------------------------------
