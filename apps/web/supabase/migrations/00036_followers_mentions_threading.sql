-- Migration: 00036_followers_mentions_threading.sql
-- Description: Rich replies with mentions, contact followers, and email threading.
--   * ticket_followers: permit contact_id as alternative to agent_id (one-of)
--   * ticket_followups: add email_message_id, mentioned_{agent,contact}_ids
--   * New index on email_message_id for inbound reply routing
-- Section ARQUITECTURA.md: 7 (schema), 12 (inbox), 15 (notifications)
-- Author: fullstack-dev + db-integration
-- Date: 2026-04-22

-- ============================================================
-- SECTION 1: ticket_followers — allow contact followers
-- ============================================================

-- Drop old UNIQUE(ticket_id, agent_id) so we can recreate as a partial index.
ALTER TABLE ticket_followers
  DROP CONSTRAINT IF EXISTS ticket_followers_ticket_id_agent_id_key;

-- Relax agent_id NOT NULL so either agent_id OR contact_id fills the row.
ALTER TABLE ticket_followers
  ALTER COLUMN agent_id DROP NOT NULL;

-- Add contact_id column (nullable).
ALTER TABLE ticket_followers
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE;

-- Enforce exactly one of (agent_id, contact_id) is set.
ALTER TABLE ticket_followers
  DROP CONSTRAINT IF EXISTS ticket_followers_one_of_principal;
ALTER TABLE ticket_followers
  ADD CONSTRAINT ticket_followers_one_of_principal
  CHECK (
    (agent_id IS NOT NULL AND contact_id IS NULL)
    OR (agent_id IS NULL AND contact_id IS NOT NULL)
  );

-- Partial unique indexes — replace the old UNIQUE(ticket_id, agent_id).
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_followers_ticket_agent
  ON ticket_followers (ticket_id, agent_id)
  WHERE agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_followers_ticket_contact
  ON ticket_followers (ticket_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- Lookup by contact.
CREATE INDEX IF NOT EXISTS idx_ticket_followers_contact
  ON ticket_followers (contact_id)
  WHERE contact_id IS NOT NULL;

-- ============================================================
-- SECTION 2: RLS — contact followers readable by same tenant staff
-- ============================================================

-- Existing staff policies already scope by tenant_id and require
-- agents.role IN ('admin','supervisor','agent'). They apply equally to rows
-- where contact_id is set — no new policy needed for writes.
-- We keep the tenant_read_ticket_followers policy as-is; it already checks
-- tenant_id against the caller's agent record.

-- ============================================================
-- SECTION 3: ticket_followups — mentions + email threading
-- ============================================================

ALTER TABLE ticket_followups
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS mentioned_agent_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentioned_contact_ids uuid[] NOT NULL DEFAULT '{}';

-- Fast lookup when an inbound email's In-Reply-To / References points here.
CREATE INDEX IF NOT EXISTS idx_ticket_followups_email_msgid
  ON ticket_followups (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- Useful for "tickets that mention me" queries.
CREATE INDEX IF NOT EXISTS idx_ticket_followups_mentioned_agents
  ON ticket_followups USING gin (mentioned_agent_ids);
CREATE INDEX IF NOT EXISTS idx_ticket_followups_mentioned_contacts
  ON ticket_followups USING gin (mentioned_contact_ids);

-- ============================================================
-- SECTION 4: Safety check — no orphaned rows
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ticket_followers
    WHERE agent_id IS NULL AND contact_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphaned ticket_followers row detected (both agent_id and contact_id NULL)';
  END IF;
END$$;

-- ============================================================
-- SECTION 5: ROLLBACK (commented)
-- ============================================================
/*
  ALTER TABLE ticket_followups
    DROP COLUMN IF EXISTS mentioned_contact_ids,
    DROP COLUMN IF EXISTS mentioned_agent_ids,
    DROP COLUMN IF EXISTS email_message_id;

  DROP INDEX IF EXISTS idx_ticket_followers_contact;
  DROP INDEX IF EXISTS ux_ticket_followers_ticket_contact;
  DROP INDEX IF EXISTS ux_ticket_followers_ticket_agent;

  ALTER TABLE ticket_followers
    DROP CONSTRAINT IF EXISTS ticket_followers_one_of_principal,
    DROP COLUMN IF EXISTS contact_id,
    ALTER COLUMN agent_id SET NOT NULL,
    ADD CONSTRAINT ticket_followers_ticket_id_agent_id_key UNIQUE (ticket_id, agent_id);
*/
