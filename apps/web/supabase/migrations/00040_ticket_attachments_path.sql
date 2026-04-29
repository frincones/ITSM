-- Migration: 00040_ticket_attachments_path.sql
-- Description: Make ticket_attachments usable as the source of truth for
--              attachment metadata, enabling on-demand signed URL refresh
--              and per-followup grouping in the timeline.
-- Date: 2026-04-29
-- Author: db-integration agent
--
-- Why this migration:
--   The original schema stored only file_url (a 7-day signed URL that
--   expires) and never linked attachments to followups. Today the reply
--   composer embeds signed URLs directly into content_html instead of
--   inserting rows here, so the table is essentially empty and we can't
--   re-sign URLs after they expire.
--
--   Adding file_path (the permanent storage key) lets a download endpoint
--   regenerate a signed URL on demand. Adding followup_id lets us render
--   attachments grouped by message in the timeline / preview panel.
--
--   Both columns are NULLABLE — older rows (and inline images that the
--   composer continues to embed in HTML for email rendering) keep working
--   unchanged.

-- ========================================
-- 1. Schema additions
-- ========================================
ALTER TABLE ticket_attachments
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE ticket_attachments
  ADD COLUMN IF NOT EXISTS followup_id uuid
    REFERENCES ticket_followups(id) ON DELETE CASCADE;

-- file_url becomes optional now that file_path is the durable identifier.
-- Guarded so reruns are idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ticket_attachments'
      AND column_name = 'file_url'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE ticket_attachments ALTER COLUMN file_url DROP NOT NULL;
  END IF;
END $$;

-- ========================================
-- 2. Indexes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_followup
  ON ticket_attachments (followup_id)
  WHERE followup_id IS NOT NULL;

-- Tenant scoping for fast count queries from the workspace preview.
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_tenant_ticket
  ON ticket_attachments (tenant_id, ticket_id);

-- ========================================
-- 3. RLS — backfill missing UPDATE/DELETE policies
-- ========================================
-- The original migration only created SELECT/INSERT. Add UPDATE so
-- /api/tickets/upload-inline can patch followup_id after the followup is
-- created, and DELETE so future cleanup tooling can use the SSR client.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_update'
  ) THEN
    CREATE POLICY ticket_attachments_update ON ticket_attachments FOR UPDATE TO authenticated
      USING (tenant_id = get_current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_delete'
  ) THEN
    CREATE POLICY ticket_attachments_delete ON ticket_attachments FOR DELETE TO authenticated
      USING (tenant_id = get_current_tenant_id());
  END IF;
END $$;

-- ========================================
-- 4. Rollback (commented)
-- ========================================
/*
DROP INDEX IF EXISTS idx_ticket_attachments_followup;
DROP INDEX IF EXISTS idx_ticket_attachments_tenant_ticket;
DROP POLICY IF EXISTS ticket_attachments_update ON ticket_attachments;
DROP POLICY IF EXISTS ticket_attachments_delete ON ticket_attachments;
ALTER TABLE ticket_attachments DROP COLUMN IF EXISTS file_path;
ALTER TABLE ticket_attachments DROP COLUMN IF EXISTS followup_id;
-- Restoring NOT NULL on file_url requires a backfill of legacy rows first.
*/
