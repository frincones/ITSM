-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00009: AI AGENTS & RAG
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates AI agents table, knowledge document/embedding
--              tables with pgvector, and semantic search function.
-- Depends on: 00008_knowledge_base.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE ai_agent_type AS ENUM (
  'triage', 'support', 'resolution', 'routing',
  'escalation', 'analytics', 'quality', 'inbox'
);

CREATE TYPE knowledge_source_type AS ENUM (
  'kb_article', 'repository', 'document', 'transcript',
  'user_story', 'webpage', 'ticket_solution'
);

-- ---------------------------------------------------------------
-- 2. TABLE: ai_agents
-- ---------------------------------------------------------------

CREATE TABLE ai_agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_type        ai_agent_type NOT NULL,
  name              text NOT NULL,
  system_prompt     text,
  model             text DEFAULT 'gpt-4o-mini',
  temperature       float DEFAULT 0.3,
  tools_enabled     text[] DEFAULT '{}',
  knowledge_sources jsonb DEFAULT '[]'::jsonb,
  is_active         boolean DEFAULT true,
  config            jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ai_agents_tenant ON ai_agents (tenant_id);
CREATE INDEX idx_ai_agents_tenant_type ON ai_agents (tenant_id, agent_type);
CREATE INDEX idx_ai_agents_tenant_active ON ai_agents (tenant_id, is_active)
  WHERE is_active = true;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY ai_agents_select ON ai_agents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ai_agents_insert ON ai_agents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY ai_agents_update ON ai_agents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY ai_agents_delete ON ai_agents FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: knowledge_documents
-- ---------------------------------------------------------------

CREATE TABLE knowledge_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type     knowledge_source_type NOT NULL,
  source_id       uuid,
  source_url      text,
  title           text NOT NULL,
  content         text NOT NULL,
  metadata        jsonb DEFAULT '{}'::jsonb,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_knowledge_documents_tenant ON knowledge_documents (tenant_id);
CREATE INDEX idx_knowledge_documents_tenant_source ON knowledge_documents (tenant_id, source_type);
CREATE INDEX idx_knowledge_documents_source_id ON knowledge_documents (tenant_id, source_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY knowledge_documents_select ON knowledge_documents FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_documents_insert ON knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_documents_update ON knowledge_documents FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_documents_delete ON knowledge_documents FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: knowledge_embeddings
-- ---------------------------------------------------------------

CREATE TABLE knowledge_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL,
  chunk_text    text NOT NULL,
  embedding     extensions.vector(1536) NOT NULL,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_embeddings FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_knowledge_embeddings_tenant ON knowledge_embeddings (tenant_id);
CREATE INDEX idx_knowledge_embeddings_document ON knowledge_embeddings (document_id);
CREATE INDEX idx_knowledge_embeddings_ivfflat ON knowledge_embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- Policies
CREATE POLICY knowledge_embeddings_select ON knowledge_embeddings FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_embeddings_insert ON knowledge_embeddings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_embeddings_update ON knowledge_embeddings FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY knowledge_embeddings_delete ON knowledge_embeddings FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. FUNCTION: match_knowledge (semantic search)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding   extensions.vector(1536),
  match_threshold   float,
  match_count       int,
  p_tenant_id       uuid
)
RETURNS TABLE (
  id            uuid,
  chunk_text    text,
  similarity    float,
  document_id   uuid,
  metadata      jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ke.id,
    ke.chunk_text,
    1 - (ke.embedding <=> query_embedding) AS similarity,
    ke.document_id,
    ke.metadata
  FROM knowledge_embeddings ke
  WHERE ke.tenant_id = p_tenant_id
    AND 1 - (ke.embedding <=> query_embedding) > match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP FUNCTION IF EXISTS match_knowledge;
--   DROP TABLE IF EXISTS knowledge_embeddings CASCADE;
--   DROP TABLE IF EXISTS knowledge_documents CASCADE;
--   DROP TABLE IF EXISTS ai_agents CASCADE;
--   DROP TYPE IF EXISTS knowledge_source_type;
--   DROP TYPE IF EXISTS ai_agent_type;
-- ═══════════════════════════════════════════════════════════════
