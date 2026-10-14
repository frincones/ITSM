// ---------------------------------------------------------------------------
// MCP Tools — Knowledge base (write)
// ---------------------------------------------------------------------------
// Read tools (kb_search, kb_get_article, kb_list_categories) live in
// tools/kb.ts. This module adds authoring: draft, edit, publish, archive.
//
// Scope design: `kb_publish_article` sits behind `kb:publish` rather than
// `kb:write`. A published article with is_public = true appears in the
// CLIENT PORTAL, so publishing is an outward-facing action — a key can draft
// and revise documentation without being able to show it to customers.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  KB_STATUSES,
  archiveArticle as domainArchive,
  createArticle as domainCreate,
  listArticles as domainList,
  listRevisions as domainListRevisions,
  publishArticle as domainPublish,
  unpublishArticle as domainUnpublish,
  updateArticle as domainUpdate,
} from '~/lib/domain/kb.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';
import { PaginationInput, buildPaginationOutput } from '../schemas';

const kbStatus = z.enum(KB_STATUSES);

// ---------------------------------------------------------------------------
// kb_list_articles
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_list_articles',
  description:
    'List knowledge base articles with filters. Unlike kb_search, which ranks by relevance, this browses the catalog by status, category, visibility or tag — use it to find drafts awaiting review or to audit what is public.',
  scope: 'kb:read',
  inputSchema: PaginationInput.extend({
    status: z.array(kbStatus).optional(),
    category_id: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
    is_public: z
      .boolean()
      .optional()
      .describe('true: visible to customers in the portal once published.'),
    language: z.string().min(2).max(8).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.3.0', tags: ['kb', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainList(toDomainContext(ctx), {
        status: input.status,
        category_id: input.category_id ?? null,
        organization_id: input.organization_id ?? null,
        is_public: input.is_public ?? null,
        language: input.language ?? null,
        tags: input.tags,
        search: input.search ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      articles: result.articles,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// kb_create_article
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_create_article',
  description:
    'Create a knowledge base article as a DRAFT. The slug is derived from the title and de-duplicated automatically. Set is_public: true to mark it for the customer portal — it still only becomes visible once published with kb_publish_article.',
  scope: 'kb:write',
  inputSchema: z.object({
    title: z.string().trim().min(1).max(255),
    content_markdown: z.string().trim().min(1).max(100_000),
    content_html: z.string().max(200_000).optional(),
    category_id: z.string().uuid().optional(),
    organization_id: z
      .string()
      .uuid()
      .optional()
      .describe('Scope the article to one client. Omit for tenant-wide knowledge.'),
    tags: z.array(z.string().trim().min(1)).default([]),
    language: z.string().min(2).max(8).default('es'),
    is_public: z.boolean().default(false),
  }),
  meta: { since: '1.3.0', tags: ['kb', 'write'] },
  async handler(ctx, input) {
    return {
      article: unwrap(
        await domainCreate(toDomainContext(ctx), {
          title: input.title,
          content_markdown: input.content_markdown,
          content_html: input.content_html ?? null,
          category_id: input.category_id ?? null,
          organization_id: input.organization_id ?? null,
          tags: input.tags,
          language: input.language,
          is_public: input.is_public,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// kb_update_article
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_update_article',
  description:
    'Update an article. Changing the content bumps its version and snapshots the previous text into the revision history — pass revision_note to record why. Changing the title regenerates the slug. Does not publish or archive; use the dedicated tools for that.',
  scope: 'kb:write',
  inputSchema: z.object({
    article_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255).optional(),
    content_markdown: z.string().trim().min(1).max(100_000).optional(),
    content_html: z.string().max(200_000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    language: z.string().min(2).max(8).optional(),
    is_public: z.boolean().optional(),
    revision_note: z.string().max(500).optional(),
  }),
  meta: { since: '1.3.0', tags: ['kb', 'write'] },
  async handler(ctx, input) {
    const { article_id, revision_note, ...patch } = input;
    return {
      article: unwrap(
        await domainUpdate(toDomainContext(ctx), article_id, patch, revision_note ?? null),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// kb_publish_article
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_publish_article',
  description:
    'Publish a draft article. If the article has is_public: true this makes it VISIBLE TO CUSTOMERS in the client portal — treat it as an outward-facing action and confirm the content first. An archived article must be returned to draft before it can be published again.',
  scope: 'kb:publish',
  inputSchema: z.object({ article_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['kb', 'write', 'outbound'] },
  async handler(ctx, input) {
    return { article: unwrap(await domainPublish(toDomainContext(ctx), input.article_id)) };
  },
});

// ---------------------------------------------------------------------------
// kb_unpublish_article
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_unpublish_article',
  description:
    'Return a published or archived article to draft, removing it from the portal. Use this to pull back an article that is wrong or outdated while it is corrected.',
  scope: 'kb:publish',
  inputSchema: z.object({ article_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['kb', 'write'] },
  async handler(ctx, input) {
    return { article: unwrap(await domainUnpublish(toDomainContext(ctx), input.article_id)) };
  },
});

// ---------------------------------------------------------------------------
// kb_archive_article
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_archive_article',
  description:
    'Archive an article: it stops appearing in search and in the portal, but is not deleted and its revision history is kept. Reversible with kb_unpublish_article.',
  scope: 'kb:write',
  inputSchema: z.object({ article_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['kb', 'write'] },
  async handler(ctx, input) {
    return { article: unwrap(await domainArchive(toDomainContext(ctx), input.article_id)) };
  },
});

// ---------------------------------------------------------------------------
// kb_article_revisions
// ---------------------------------------------------------------------------

registry.register({
  name: 'kb_article_revisions',
  description:
    'Revision history for an article, newest first. Each entry holds the content as it was BEFORE the edit that created it, who made the change and the note they left.',
  scope: 'kb:read',
  inputSchema: z.object({
    article_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  meta: { since: '1.3.0', tags: ['kb', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListRevisions(toDomainContext(ctx), input.article_id, input.limit),
    );
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __kbWriteToolsLoaded = true;
