-- Per-organization inbound email slug
-- Users can send emails to soporte+<slug>@itsm.tdxcore.com to create tickets
-- automatically routed to the right organization.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS inbound_email_slug text;

-- Enforce uniqueness per tenant (so two tenants could reuse "podenza" slug)
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_inbound_email_slug
  ON organizations (tenant_id, lower(inbound_email_slug))
  WHERE inbound_email_slug IS NOT NULL;

-- Backfill slug from the existing organizations.slug where safe
UPDATE organizations
   SET inbound_email_slug = slug
 WHERE inbound_email_slug IS NULL
   AND slug ~ '^[a-z0-9_-]+$';
