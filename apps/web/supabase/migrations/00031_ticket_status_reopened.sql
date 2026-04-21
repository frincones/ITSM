-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00031: TICKET STATUS 'reopened'
-- ═══════════════════════════════════════════════════════════════
-- Add 'reopened' as a first-class status so a ticket that comes back from
-- resolved/closed is visually distinct in lists and reports, and so we can
-- count re-aperturas as a KPI (common ask from MSPs running SLA programs).
--
-- Existing behavior was to push ticket back to 'in_progress' on inbound
-- email reply; that hid the re-open signal in the timeline. With 'reopened'
-- we preserve trazabilidad for both agents and clients.

ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'reopened';

-- Track how many times a ticket has been reopened and when it last happened.
-- Kept as dedicated columns (not custom_fields) so we can index / report.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reopened_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_reopened
  ON tickets (tenant_id, last_reopened_at DESC)
  WHERE last_reopened_at IS NOT NULL;
