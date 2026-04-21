-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00033: NPS / CSAT SURVEYS
-- ═══════════════════════════════════════════════════════════════
-- When a ticket moves to closed/resolved we queue a single-question NPS
-- email: "¿Qué tan probable es que recomiendes nuestro servicio?" scale
-- 0-10. Standard NPS buckets: 0-6 detractor, 7-8 pasivo, 9-10 promotor.
-- NPS = %promotores - %detractores (computed in metrics layer).
--
-- Timing: 5 minutes after close (product decision). Research cited by
-- Zendesk itself shows 5-10 min post-close beats 24h for response rate
-- without giving the customer enough time to forget the interaction.
--
-- Responses are public-token based so the customer doesn't need to log
-- in. Tokens are single-use and expire after 30 days.

CREATE TABLE IF NOT EXISTS nps_surveys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  token           text NOT NULL UNIQUE,
  score           integer CHECK (score BETWEEN 0 AND 10),
  category        text GENERATED ALWAYS AS (
    CASE
      WHEN score IS NULL THEN NULL
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,
  comment         text,
  sent_at         timestamptz,
  responded_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_surveys FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_nps_surveys_tenant
  ON nps_surveys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_ticket
  ON nps_surveys (ticket_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_org_responded
  ON nps_surveys (tenant_id, organization_id, responded_at)
  WHERE responded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_surveys_pending
  ON nps_surveys (sent_at)
  WHERE sent_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON nps_surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: agents see their tenant's surveys (for dashboards); public
-- submission happens via service role from the /nps/[token] route.
CREATE POLICY nps_surveys_select ON nps_surveys FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- Prevent duplicate surveys for the same ticket when it is re-closed
-- multiple times (reopen → close cycles). If you want one per cycle,
-- remove this and rely on the queue dedup.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nps_per_ticket
  ON nps_surveys (ticket_id)
  WHERE responded_at IS NULL;
