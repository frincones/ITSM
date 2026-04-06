-- Migration: 00028_followup_source_ref.sql
-- Description: Add source_ref column for webhook idempotency + enable realtime
-- Date: 2026-04-06

-- Add source_ref for deduplication of inbound email webhooks
ALTER TABLE ticket_followups ADD COLUMN IF NOT EXISTS source_ref text;

-- Unique index: only one followup per source_ref per ticket (NULLs are ignored)
CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_source_ref_unique
  ON ticket_followups (ticket_id, source_ref) WHERE source_ref IS NOT NULL;

-- Enable realtime on ticket_followups for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_followups;
