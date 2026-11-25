-- ---------------------------------------------------------------------------
-- 00088 · Realtime: from postgres_changes to Broadcast
-- ---------------------------------------------------------------------------
-- postgres_changes keeps a Realtime worker polling the WAL ~2×/second, 24/7,
-- whether anything changed or not. Measured on prod (2026-11-24, 11.5 h,
-- 3 users): 76,703 polls = 524 s of DB time, 76% of the total, against 92 s
-- for every app query combined. On a Micro instance that starves the app.
--
-- Broadcast from Database is push-based: a trigger writes to
-- realtime.messages only when a row actually changes, and Realtime streams it
-- over its own replication slot. No polling.
--
--   notifications     → topic `notifications:<user_id>`  (bell, toast, sound)
--   ticket_followups  → topic `ticket:<ticket_id>` (+ `:internal` for
--                        private notes, staff only)  (detail timeline;
--                        addFollowup deliberately skips revalidatePath and
--                        relies on this to show the agent's own reply)
--   tickets           → no longer live; list/workspace refresh on tab focus.
--
-- Topics are private: the client joins with { private: true } and the RLS
-- policies below decide who may listen.
-- ---------------------------------------------------------------------------

-- 1. Trigger functions -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.broadcast_notification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'notifications:' || COALESCE(NEW.user_id, OLD.user_id)::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NULL;
END;
$$;

-- Internal notes go to their own topic so only staff can hear them. The
-- ticket_followups SELECT policy does not filter is_private, so under
-- postgres_changes a client user with org access received internal notes
-- live; Broadcast must not repeat that.
CREATE OR REPLACE FUNCTION public.broadcast_followup_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  v_row public.ticket_followups;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  PERFORM realtime.broadcast_changes(
    'ticket:' || v_row.ticket_id::text
      || CASE WHEN v_row.is_private THEN ':internal' ELSE '' END,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_notification_change ON public.notifications;
CREATE TRIGGER broadcast_notification_change
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification_change();

DROP TRIGGER IF EXISTS broadcast_followup_change ON public.ticket_followups;
CREATE TRIGGER broadcast_followup_change
  AFTER INSERT OR UPDATE OR DELETE ON public.ticket_followups
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_followup_change();

-- 2. Who may listen ----------------------------------------------------------
-- realtime.topic() is the channel being joined. Realtime evaluates this once
-- at join time, as the connecting user, so the tickets subquery is filtered
-- by the tickets RLS policies (tenant scoping, deleted_at) automatically.

DROP POLICY IF EXISTS "listen own notifications" ON realtime.messages;
CREATE POLICY "listen own notifications"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() = 'notifications:' || auth.uid()::text
  );

-- `ticket:<uuid>`          → anyone who can see the ticket
-- `ticket:<uuid>:internal` → staff agents who can see the ticket
DROP POLICY IF EXISTS "listen visible ticket timeline" ON realtime.messages;
CREATE POLICY "listen visible ticket timeline"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() ~ '^ticket:[0-9a-f-]{36}(:internal)?$'
    AND (realtime.topic() NOT LIKE '%:internal' OR public.is_staff_agent())
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = substring(realtime.topic() FROM 8 FOR 36)
    )
  );

-- 3. Stop the WAL poller -----------------------------------------------------
-- With no table left in the publication, postgres_changes has nothing to
-- poll. Any stale client still subscribing simply receives no events.

ALTER PUBLICATION supabase_realtime DROP TABLE public.tickets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ticket_followups;
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;

-- 00038 set FULL so UPDATE events carried the whole row. Nothing reads the
-- WAL for tickets anymore; 00044 already returned it to DEFAULT on prod —
-- restated here so a fresh database ends in the same state.
ALTER TABLE public.tickets REPLICA IDENTITY DEFAULT;

-- ---------------------------------------------------------------------------
-- Rollback:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets,
--     public.ticket_followups, public.notifications;
--   DROP TRIGGER broadcast_notification_change ON public.notifications;
--   DROP TRIGGER broadcast_followup_change ON public.ticket_followups;
--   DROP FUNCTION public.broadcast_notification_change();
--   DROP FUNCTION public.broadcast_followup_change();
--   DROP POLICY "listen own notifications" ON realtime.messages;
--   DROP POLICY "listen visible ticket timeline" ON realtime.messages;
-- (and redeploy the previous client build)
-- ---------------------------------------------------------------------------
