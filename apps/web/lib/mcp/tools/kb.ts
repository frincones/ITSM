// ---------------------------------------------------------------------------
// MCP Tools — Knowledge Base
// ---------------------------------------------------------------------------
// Reads only. Article authoring stays in the UI.
// Semantic (vector) search is intentionally NOT exposed in this version
// to avoid adding an embedding dependency to the MCP surface — the
// existing match_knowledge RPC remains available for future use.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const ARTICLE_LIST_COLUMNS =
  'id, title, slug, category_id, status, is_public, view_count, helpful_count, tags, language, version, published_at, created_at, updated_at';

const ARTICLE_DETAIL_COLUMNS = ARTICLE_LIST_COLUMNS + ', content_markdown, content_html, ai_auto_generated, author_id';

registry.register({
  name: 'kb.list_categories',
  description: 'List knowledge base categories with parent / child hierarchy info.',
  scope: 'kb:read',
  inputSchema: z.object({
    is_active: z.boolean().default(true),
  }),
  meta: { since: '1.0.0', tags: ['kb', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('kb_categories')
      .select('id, name, slug, description, parent_id, icon, sort_order, is_active, created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('sort_order', { ascending: true });
    if (typeof input.is_active === 'boolean') q = q.eq('is_active', input.is_active);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [] };
  },
});

registry.register({
  name: 'kb.search',
  description: 'Search knowledge base articles by title, content, and tags using case-insensitive substring match. Returns published articles only by default.',
  scope: 'kb:search',
  inputSchema: PaginationInput.extend({
    query: z.string().min(2).max(200),
    category_id: z.string().uuid().optional(),
    language: z.string().min(2).max(8).optional(),
    only_public: z.boolean().default(false),
    include_drafts: z.boolean().default(false),
    tags: z.array(z.string().min(1)).optional(),
  }),
  meta: { since: '1.0.0', tags: ['kb', 'search'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    const safe = input.query.replace(/[%_,]/g, ' ').trim();

    let q = ctx.supabase
      .from('kb_articles')
      .select(ARTICLE_LIST_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .or(`title.ilike.%${safe}%,content_markdown.ilike.%${safe}%`)
      .order('helpful_count', { ascending: false })
      .range(from, to);

    if (!input.include_drafts) q = q.eq('status', 'published');
    if (input.only_public) q = q.eq('is_public', true);
    if (input.category_id) q = q.eq('category_id', input.category_id);
    if (input.language) q = q.eq('language', input.language);
    if (input.tags && input.tags.length > 0) q = q.contains('tags', input.tags);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      data: data ?? [],
      pagination: buildPaginationOutput(input, count),
      query: input.query,
    };
  },
});

registry.register({
  name: 'kb.get_article',
  description: 'Get a single knowledge base article by id or slug, including full markdown content.',
  scope: 'kb:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    slug: z.string().min(1).optional(),
  }).refine((v) => v.id || v.slug, { message: 'Either id or slug is required' }),
  meta: { since: '1.0.0', tags: ['kb', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('kb_articles')
      .select(ARTICLE_DETAIL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null);

    if (input.id) q = q.eq('id', input.id);
    else if (input.slug) q = q.eq('slug', input.slug);

    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Article');
    return { article: data };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __kbToolsLoaded = true;
