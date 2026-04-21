-- Ticket followers (Zendesk/Freshdesk-style watchers).
--
-- The assigned_agent_id column stays the "single responsible" indicator,
-- but notifications now fan out to assignee UNION followers. Typical flow:
--   1. Ticket created → creator is auto-added as follower
--   2. Ticket assigned/reassigned → both the new and previous assignee are
--      auto-added as followers (so the previous owner keeps visibility)
--   3. Any agent who posts a followup is auto-added
--   4. Agents can manually subscribe/unsubscribe from the ticket detail UI
--
-- All writes go through server code with service-role or auth'd agent
-- credentials, so RLS just scopes reads to the tenant.

CREATE TABLE IF NOT EXISTS ticket_followers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id      uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id       uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  added_at       timestamptz NOT NULL DEFAULT now(),
  added_reason   text,
  is_auto        boolean NOT NULL DEFAULT true,
  UNIQUE (ticket_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_followers_ticket
  ON ticket_followers(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_followers_agent
  ON ticket_followers(agent_id);

ALTER TABLE ticket_followers ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped read: any active TDX agent in the same tenant can see
-- who's following which ticket.
DROP POLICY IF EXISTS tenant_read_ticket_followers ON ticket_followers;
CREATE POLICY tenant_read_ticket_followers ON ticket_followers
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM agents
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Tenant-scoped write (insert + delete). We rely on server code to decide
-- "who may follow whom" — once you're an active agent of the tenant, you
-- can add/remove follower rows in that tenant. Clients (role=readonly)
-- are excluded because they don't have an agents row with is_active=true
-- that matches their auth.uid(), UNLESS… they do. To be safe we also
-- require a non-readonly role here.
DROP POLICY IF EXISTS staff_write_ticket_followers ON ticket_followers;
CREATE POLICY staff_write_ticket_followers ON ticket_followers
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM agents
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('admin', 'supervisor', 'agent')
    )
  );

DROP POLICY IF EXISTS staff_delete_ticket_followers ON ticket_followers;
CREATE POLICY staff_delete_ticket_followers ON ticket_followers
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM agents
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('admin', 'supervisor', 'agent')
    )
  );
