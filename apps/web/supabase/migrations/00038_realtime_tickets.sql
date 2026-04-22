-- Enables Supabase Realtime for the `tickets` table so the agent-facing
-- list (`/home/tickets`) and workspace (`/home/workspace`) receive live
-- INSERT/UPDATE events without a page refresh.
--
-- REPLICA IDENTITY FULL is required so every UPDATE broadcast carries
-- the full NEW row (default identity only carries PK cols, which breaks
-- client-side state merging and filtering).
--
-- `ticket_followups` is already in the publication (added elsewhere) and
-- is left alone; counts of followups are not displayed in the list, so
-- extending REPLICA IDENTITY there serves no purpose right now.
--
-- Soft-delete side-effect: `tickets_select` RLS filters `deleted_at IS
-- NULL`, so when a ticket is soft-deleted the realtime UPDATE is
-- dropped for subscribers (they never see the deleted row). Clients
-- keep showing the deleted ticket until the caller's
-- `revalidatePath('/home/tickets')` forces the server query to run
-- again — which is the current (pre-realtime) behavior anyway, so this
-- is a graceful degradation rather than a regression.

ALTER TABLE tickets REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
