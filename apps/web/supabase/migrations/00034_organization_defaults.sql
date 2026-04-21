-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00034: ORGANIZATION DEFAULTS FOR INBOUND TICKETS
-- ═══════════════════════════════════════════════════════════════
-- When a ticket is created via the inbound-email webhook, we know the
-- organization (resolved by the +slug address) but there's no routing
-- info for who should own it. These defaults let each client pre-set:
--   default_group_id → which support group picks up inbound tickets
--   default_agent_id → an optional specific agent (e.g. dedicated TAM)
--
-- If both are set, the agent wins. If neither is set the existing
-- round-robin assignment kicks in (autoAssignRoundRobin) unchanged.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_default_group
  ON organizations (tenant_id, default_group_id)
  WHERE default_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_default_agent
  ON organizations (tenant_id, default_agent_id)
  WHERE default_agent_id IS NOT NULL;
