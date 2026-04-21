-- Performance: speed up the two hottest ticket queries.
--
-- 1) TicketsPage default sort: (tenant_id via RLS) + organization_id + deleted_at IS NULL
--    ORDER BY closed_at DESC NULLS FIRST, created_at DESC
--
-- 2) WorkspacePage open-tickets list: tenant_id + deleted_at IS NULL + status NOT IN (...)
--    ORDER BY created_at DESC
--
-- Partial indexes (WHERE deleted_at IS NULL) keep them small — soft-deleted
-- rows never appear in these lists.

CREATE INDEX IF NOT EXISTS idx_tickets_active_list
  ON tickets (tenant_id, organization_id, closed_at DESC NULLS FIRST, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_active_created
  ON tickets (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

ANALYZE tickets;
