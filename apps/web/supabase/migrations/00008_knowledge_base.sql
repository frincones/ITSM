-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00008: KNOWLEDGE BASE
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates knowledge base tables including categories,
--              articles, revisions, and feedback with full RLS.
-- Depends on: 00006_sla_ola.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------

CREATE TYPE kb_article_status AS ENUM ('draft', 'published', 'archived');

-- ---------------------------------------------------------------
-- 2. TABLE: kb_categories (hierarchical)
-- ---------------------------------------------------------------

CREATE TABLE kb_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  slug        text NOT NULL,
  parent_id   uuid REFERENCES kb_categories(id),
  icon        text,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- RLS
ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_kb_categories_tenant ON kb_categories (tenant_id);
CREATE INDEX idx_kb_categories_parent ON kb_categories (tenant_id, parent_id);
CREATE INDEX idx_kb_categories_slug ON kb_categories (tenant_id, slug);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON kb_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY kb_categories_select ON kb_categories FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_categories_insert ON kb_categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY kb_categories_update ON kb_categories FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_categories_delete ON kb_categories FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: kb_articles
-- ---------------------------------------------------------------

CREATE TABLE kb_articles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id       uuid REFERENCES kb_categories(id),
  title             text NOT NULL,
  slug              text NOT NULL,
  content_markdown  text NOT NULL,
  content_html      text,
  status            kb_article_status NOT NULL DEFAULT 'draft',
  author_id         uuid REFERENCES agents(id),
  is_public         boolean DEFAULT false,
  view_count        integer DEFAULT 0,
  helpful_count     integer DEFAULT 0,
  not_helpful_count integer DEFAULT 0,
  ai_auto_generated boolean DEFAULT false,
  tags              text[] DEFAULT '{}',
  language          text DEFAULT 'es',
  version           integer DEFAULT 1,
  published_at      timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- RLS
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_kb_articles_tenant ON kb_articles (tenant_id);
CREATE INDEX idx_kb_articles_tenant_status ON kb_articles (tenant_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_kb_articles_tenant_category ON kb_articles (tenant_id, category_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_kb_articles_slug ON kb_articles (tenant_id, slug);
CREATE INDEX idx_kb_articles_tenant_public ON kb_articles (tenant_id, is_public)
  WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX idx_kb_articles_tags ON kb_articles USING gin (tags);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies (select filters soft-deleted)
CREATE POLICY kb_articles_select ON kb_articles FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY kb_articles_insert ON kb_articles FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY kb_articles_update ON kb_articles FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_articles_delete ON kb_articles FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 4. TABLE: kb_article_revisions
-- ---------------------------------------------------------------

CREATE TABLE kb_article_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id        uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  content_markdown  text NOT NULL,
  revised_by        uuid REFERENCES agents(id),
  revision_note     text,
  version           integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE kb_article_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_revisions FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_kb_article_revisions_tenant ON kb_article_revisions (tenant_id);
CREATE INDEX idx_kb_article_revisions_article ON kb_article_revisions (article_id, created_at DESC);

-- Policies
CREATE POLICY kb_article_revisions_select ON kb_article_revisions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_revisions_insert ON kb_article_revisions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_revisions_update ON kb_article_revisions FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_revisions_delete ON kb_article_revisions FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 5. TABLE: kb_article_feedback
-- ---------------------------------------------------------------

CREATE TABLE kb_article_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id  uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id),
  is_helpful  boolean NOT NULL,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

-- RLS
ALTER TABLE kb_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_feedback FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_kb_article_feedback_tenant ON kb_article_feedback (tenant_id);
CREATE INDEX idx_kb_article_feedback_article ON kb_article_feedback (article_id);

-- Policies
CREATE POLICY kb_article_feedback_select ON kb_article_feedback FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_feedback_insert ON kb_article_feedback FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_feedback_update ON kb_article_feedback FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY kb_article_feedback_delete ON kb_article_feedback FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS kb_article_feedback CASCADE;
--   DROP TABLE IF EXISTS kb_article_revisions CASCADE;
--   DROP TABLE IF EXISTS kb_articles CASCADE;
--   DROP TABLE IF EXISTS kb_categories CASCADE;
--   DROP TYPE IF EXISTS kb_article_status;
-- ═══════════════════════════════════════════════════════════════
