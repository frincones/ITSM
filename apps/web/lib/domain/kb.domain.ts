// ---------------------------------------------------------------------------
// Domain layer — knowledge base
// ---------------------------------------------------------------------------
// Articles, categories and revision history.
//
// Publishing matters more than it looks: a published article with
// is_public = true is visible in the CLIENT PORTAL, so publishing is an
// outward-facing action, not an internal edit. That is why the MCP tool that
// publishes carries its own scope and says so in its description.
//
// Schema note: lib/schemas/kb.schema.ts does NOT match the table. It declares
// `content`, `summary` and `visibility`; the columns are `content_markdown`,
// (no summary at all) and `is_public`. Verified against production:
//
//     Could not find the 'content' column of 'kb_articles' in the schema cache
//
// It also omits `slug`, which is NOT NULL with no default:
//
//     null value in column "slug" violates not-null constraint
//
// So createArticle in lib/actions/kb.ts could never have worked. This module
// uses the real columns and derives the slug.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, resolveOrgScope, type DomainContext, type DomainResult } from './types';

/** kb_article_status enum. */
export const KB_STATUSES = ['draft', 'published', 'archived'] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

const ARTICLE_COLUMNS =
  'id, category_id, organization_id, title, slug, content_markdown, content_html, status, author_id, is_public, view_count, helpful_count, not_helpful_count, ai_auto_generated, tags, language, version, published_at, created_at, updated_at';

const LIST_COLUMNS =
  'id, category_id, organization_id, title, slug, status, is_public, view_count, helpful_count, not_helpful_count, tags, language, version, published_at, created_at, updated_at';

/**
 * Builds a URL-safe slug from a title.
 *
 * Strips diacritics first so "Cómo configurar la VPN" yields
 * "como-configurar-la-vpn" rather than dropping the accented characters and
 * producing "c-mo-configurar-la-vpn".
 */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'articulo';
}

/**
 * Finds a slug that is free within the tenant.
 *
 * kb_articles has UNIQUE(tenant_id, slug), so two articles titled the same
 * would collide. Appends -2, -3, … until one is free rather than failing and
 * making the caller invent a title.
 */
async function uniqueSlug(
  ctx: DomainContext,
  base: string,
  excludeId?: string,
): Promise<string> {
  const { actor, client } = ctx;

  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    let query = client
      .from('kb_articles')
      .select('id')
      .eq('tenant_id', actor.tenantId)
      .eq('slug', candidate);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query.maybeSingle();
    if (!data) return candidate;
  }
  // Pathological case: fall back to something that cannot collide.
  return `${base}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface ListArticlesFilters {
  status?: KbStatus[];
  category_id?: string | null;
  organization_id?: string | null;
  is_public?: boolean | null;
  language?: string | null;
  search?: string | null;
  tags?: string[];
  page: number;
  limit: number;
}

export async function listArticles(
  ctx: DomainContext,
  filters: ListArticlesFilters,
): Promise<DomainResult<{ articles: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('kb_articles')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  // A tenant-wide article (organization_id null) is shared knowledge and must
  // stay visible to an org-scoped caller.
  if (orgScope) {
    query = query.or(
      `organization_id.in.(${orgScope.join(',')}),organization_id.is.null`,
    );
  }

  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.category_id) query = query.eq('category_id', filters.category_id);
  if (filters.language) query = query.eq('language', filters.language);
  if (filters.is_public !== null && filters.is_public !== undefined) {
    query = query.eq('is_public', filters.is_public);
  }
  if (filters.tags?.length) query = query.contains('tags', filters.tags);
  if (filters.search) {
    query = query.ilike('title', `%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  }

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ articles: data ?? [], total: count ?? 0 });
}

/** Loads an article inside the actor's tenant and org scope, or null. */
async function loadArticle(ctx: DomainContext, articleId: string, columns = ARTICLE_COLUMNS) {
  const { actor, client } = ctx;

  let query = client
    .from('kb_articles')
    .select(columns)
    .eq('id', articleId)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null);

  const orgScope = resolveOrgScope(actor);
  if (orgScope) {
    query = query.or(
      `organization_id.in.(${orgScope.join(',')}),organization_id.is.null`,
    );
  }

  const { data } = await query.maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function getArticle(
  ctx: DomainContext,
  articleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const article = await loadArticle(ctx, articleId);
  if (!article) return fail('Article not found', 'not_found');
  return ok({ article });
}

export async function listRevisions(
  ctx: DomainContext,
  articleId: string,
  limit = 20,
): Promise<DomainResult<{ revisions: unknown[] }>> {
  const article = await loadArticle(ctx, articleId, 'id');
  if (!article) return fail('Article not found', 'not_found');

  const { data, error } = await ctx.client
    .from('kb_article_revisions')
    .select('*')
    .eq('article_id', articleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return fail(error.message, 'internal');
  return ok({ revisions: data ?? [] });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface ArticleFields {
  title: string;
  content_markdown: string;
  content_html?: string | null;
  category_id?: string | null;
  organization_id?: string | null;
  tags?: string[];
  language?: string;
  /** Visible in the client portal once published. Defaults to internal-only. */
  is_public?: boolean;
}

/**
 * Creates an article as a draft.
 *
 * Always draft: an article becomes visible (and, when is_public, visible to
 * customers) only through publishArticle, which is a separate decision.
 */
export async function createArticle(
  ctx: DomainContext,
  fields: ArticleFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const organizationId = fields.organization_id ?? null;
  if (organizationId) {
    const scope = resolveOrgScope(actor, [organizationId]);
    if (scope && !scope.includes(organizationId)) {
      return fail('organization_id is outside the caller allowlist', 'forbidden');
    }
  }

  const slug = await uniqueSlug(ctx, slugify(fields.title));

  const { data, error } = await client
    .from('kb_articles')
    .insert({
      tenant_id: actor.tenantId,
      title: fields.title,
      slug,
      content_markdown: fields.content_markdown,
      content_html: fields.content_html ?? null,
      category_id: fields.category_id ?? null,
      organization_id: organizationId,
      tags: fields.tags ?? [],
      language: fields.language ?? 'es',
      is_public: fields.is_public ?? false,
      status: 'draft',
      version: 1,
      // author_id references agents(id), NOT auth.users — unlike
      // ticket_followups.author_id. It is nullable, so a key with no actor
      // can still draft.
      author_id: actor.agentId,
    })
    .select(ARTICLE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function updateArticle(
  ctx: DomainContext,
  articleId: string,
  patch: Partial<ArticleFields>,
  /** Why this edit was made; stored on the revision when content changes. */
  revisionNote?: string | null,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadArticle(
    ctx,
    articleId,
    'id, title, slug, status, version, content_markdown',
  );
  if (!existing) return fail('Article not found', 'not_found');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    payload.title = patch.title;
    // Keep the slug aligned with the title, but never let it collide.
    payload.slug = await uniqueSlug(ctx, slugify(patch.title), articleId);
  }
  if (patch.content_markdown !== undefined) {
    payload.content_markdown = patch.content_markdown;
    // A content change is a new version; revisions are keyed off it.
    payload.version = ((existing.version as number | null) ?? 1) + 1;
  }
  if (patch.content_html !== undefined) payload.content_html = patch.content_html;
  if (patch.category_id !== undefined) payload.category_id = patch.category_id;
  if (patch.tags !== undefined) payload.tags = patch.tags;
  if (patch.language !== undefined) payload.language = patch.language;
  if (patch.is_public !== undefined) payload.is_public = patch.is_public;

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  // `status` is deliberately not patchable: publishing and archiving are
  // separate operations with their own meaning and scope.
  const { data, error } = await client
    .from('kb_articles')
    .update(payload)
    .eq('id', articleId)
    .eq('tenant_id', actor.tenantId)
    .select(ARTICLE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');

  // Snapshot the PREVIOUS content so the revision history records what the
  // article looked like before this edit. Written after the update succeeds,
  // and never allowed to fail the edit — a missing revision is a gap in the
  // audit trail, not a reason to lose the author's work.
  if (patch.content_markdown !== undefined) {
    await client
      .from('kb_article_revisions')
      .insert({
        tenant_id: actor.tenantId,
        article_id: articleId,
        content_markdown: (existing.content_markdown as string | null) ?? '',
        revised_by: actor.agentId,
        revision_note: revisionNote ?? null,
        version: (existing.version as number | null) ?? 1,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return ok(data as Record<string, unknown>);
}

/**
 * Publishes a draft.
 *
 * An archived article is not published directly — it has to be reopened as a
 * draft first, so a deliberately retired article cannot be resurrected by a
 * single call.
 */
export async function publishArticle(
  ctx: DomainContext,
  articleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadArticle(ctx, articleId, 'id, title, status, content_markdown');
  if (!existing) return fail('Article not found', 'not_found');

  if (existing.status === 'archived') {
    return fail(
      'This article is archived. Move it back to draft before publishing.',
      'conflict',
    );
  }
  if (existing.status === 'published') {
    return fail('Article is already published', 'conflict');
  }
  if (!String(existing.content_markdown ?? '').trim()) {
    return fail('Cannot publish an article with empty content', 'invalid_input');
  }

  const now = new Date().toISOString();
  const { data, error } = await client
    .from('kb_articles')
    .update({ status: 'published', published_at: now, updated_at: now })
    .eq('id', articleId)
    .eq('tenant_id', actor.tenantId)
    .select(ARTICLE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function archiveArticle(
  ctx: DomainContext,
  articleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadArticle(ctx, articleId, 'id, status');
  if (!existing) return fail('Article not found', 'not_found');
  if (existing.status === 'archived') {
    return fail('Article is already archived', 'conflict');
  }

  const { data, error } = await client
    .from('kb_articles')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', articleId)
    .eq('tenant_id', actor.tenantId)
    .select(ARTICLE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

/** Moves a published or archived article back to draft. */
export async function unpublishArticle(
  ctx: DomainContext,
  articleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const existing = await loadArticle(ctx, articleId, 'id, status');
  if (!existing) return fail('Article not found', 'not_found');
  if (existing.status === 'draft') {
    return fail('Article is already a draft', 'conflict');
  }

  const { data, error } = await client
    .from('kb_articles')
    .update({ status: 'draft', published_at: null, updated_at: new Date().toISOString() })
    .eq('id', articleId)
    .eq('tenant_id', actor.tenantId)
    .select(ARTICLE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}
