-- Migration: 00024_org_ai_context.sql
-- Description: Add ai_context column to organizations for AI assistant context
-- Purpose: Allow admins to provide application context per client organization
--          so the AI support agent can classify and respond more accurately
-- Impact: Zero - nullable column addition, no data rewrite
-- Author: db-integration agent
-- Date: 2026-03-30

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_context text;

COMMENT ON COLUMN organizations.ai_context IS
  'Free-text context about the client application (description, user stories, '
  'known issues, classification rules) injected into AI agent prompts for '
  'accurate L1 support and ticket classification.';
