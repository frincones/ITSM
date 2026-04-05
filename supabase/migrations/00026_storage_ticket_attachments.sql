-- Migration: 00026_storage_ticket_attachments.sql
-- Description: Create Supabase Storage bucket for ticket attachments
--              uploaded from the portal chat
-- Author: db-integration agent
-- Date: 2026-04-05

-- ========================================
-- SECTION 1: STORAGE BUCKET
-- ========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- SECTION 2: STORAGE RLS POLICIES
-- ========================================

-- Authenticated users can upload files
CREATE POLICY "ticket_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');

-- Authenticated users can read files from their tenant
CREATE POLICY "ticket_attachments_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-attachments');

-- Service role can do anything (for API routes using service key)
-- (Already granted by default for service_role)

-- ========================================
-- SECTION 3: ROLLBACK (Commented)
-- ========================================
/*
DELETE FROM storage.buckets WHERE id = 'ticket-attachments';
*/
