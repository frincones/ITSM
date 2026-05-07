-- 00030_tickets_list_indexes.sql
--
-- Composite indexes for the tickets list page (apps/web/app/home/tickets/page.tsx).
-- The list filters by tenant_id (RLS) + organization_id and/or status, and orders
-- by created_at DESC. Without a covering composite index, every filter change ran
-- a partial scan that scaled linearly with the tenant's ticket count — visible as
-- multi-second waits when applying filters.
--
-- All indexes are idempotent so this migration is safe to re-run. Adding a new
-- index briefly locks the table for writes; on a healthy install this is sub-second.

-- Most common combo: tenant + org + status, sorted newest first.
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_org_status_created
  ON tickets (tenant_id, organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Priority filter (used by the "critical" tab and the priority dropdown).
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_priority_created
  ON tickets (tenant_id, priority, created_at DESC)
  WHERE deleted_at IS NULL;

-- Type filter (incident / request / problem / change).
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_type_created
  ON tickets (tenant_id, type, created_at DESC)
  WHERE deleted_at IS NULL;

-- Date-range filter (?from / ?to in the URL) without a status filter.
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_created_active
  ON tickets (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

ANALYZE tickets;
