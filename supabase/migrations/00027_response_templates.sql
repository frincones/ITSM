-- Migration: 00027_response_templates.sql
-- Description: Response templates (macros) for agent reply composer
-- Author: db-integration agent
-- Date: 2026-04-05

CREATE TABLE IF NOT EXISTS response_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  content     text NOT NULL,
  category    text,
  shortcut    text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY response_templates_select ON response_templates
  FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());
CREATE POLICY response_templates_insert ON response_templates
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY response_templates_update ON response_templates
  FOR UPDATE TO authenticated USING (tenant_id = get_current_tenant_id());
CREATE POLICY response_templates_delete ON response_templates
  FOR DELETE TO authenticated USING (tenant_id = get_current_tenant_id());

CREATE INDEX idx_response_templates_tenant ON response_templates (tenant_id);
