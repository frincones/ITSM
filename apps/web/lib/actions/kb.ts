'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createArticleSchema,
  updateArticleSchema,
  articleFeedbackSchema,
  articleStatusEnum,
  type CreateArticleInput,
  type UpdateArticleInput,
  type ArticleFeedbackInput,
} from '~/lib/schemas/kb.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their agent record + tenant_id.
 * Returns an ActionResult-style error when the user or agent cannot be found.
 */
async function requireAgent(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { agent: null, user: null, error: 'Unauthorized' } as const;
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, error: 'Agent not found' } as const;
  }

  return { agent, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// 1. createArticle
// ---------------------------------------------------------------------------

export async function createArticle(
  input: CreateArticleInput,
): Promise<ActionResult> {
  try {
    const validated = createArticleSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: article, error } = await client
      .from('kb_articles')
      .insert({
        ...validated,
        tenant_id: agent.tenant_id, // NEVER from frontend
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/kb');
    return { data: article, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. updateArticle
// ---------------------------------------------------------------------------

export async function updateArticle(
  articleId: string,
  input: UpdateArticleInput,
): Promise<ActionResult> {
  try {
    const validated = updateArticleSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify the article belongs to the same tenant
    const { data: existing } = await client
      .from('kb_articles')
      .select('id, tenant_id, content')
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Article not found' };
    }

    // If content is changing, create a revision of the old content
    if (validated.content && validated.content !== existing.content) {
      await client.from('kb_article_revisions').insert({
        tenant_id: agent.tenant_id,
        article_id: articleId,
        content: existing.content,
        created_by: user.id,
      });
    }

    const { data: article, error } = await client
      .from('kb_articles')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/kb');
    revalidatePath(`/home/kb/${articleId}`);
    return { data: article, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. publishArticle
// ---------------------------------------------------------------------------

export async function publishArticle(
  articleId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify article belongs to tenant
    const { data: existing } = await client
      .from('kb_articles')
      .select('id, tenant_id, status')
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Article not found' };
    }

    if (existing.status === 'archived') {
      return { data: null, error: 'Cannot publish an archived article. Restore it first.' };
    }

    const now = new Date().toISOString();
    const { data: article, error } = await client
      .from('kb_articles')
      .update({
        status: 'published',
        published_at: now,
        updated_at: now,
      })
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/kb');
    revalidatePath(`/home/kb/${articleId}`);
    return { data: article, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. archiveArticle
// ---------------------------------------------------------------------------

export async function archiveArticle(
  articleId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify article belongs to tenant
    const { data: existing } = await client
      .from('kb_articles')
      .select('id, tenant_id')
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Article not found' };
    }

    const now = new Date().toISOString();
    const { data: article, error } = await client
      .from('kb_articles')
      .update({
        status: 'archived',
        updated_at: now,
      })
      .eq('id', articleId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/kb');
    revalidatePath(`/home/kb/${articleId}`);
    return { data: article, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 5. addArticleFeedback
// ---------------------------------------------------------------------------

export async function addArticleFeedback(
  input: ArticleFeedbackInput,
): Promise<ActionResult> {
  try {
    const validated = articleFeedbackSchema.parse(input);
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify article belongs to tenant
    const { data: article } = await client
      .from('kb_articles')
      .select('id, tenant_id')
      .eq('id', validated.article_id)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!article) {
      return { data: null, error: 'Article not found' };
    }

    const { data: feedback, error } = await client
      .from('kb_article_feedback')
      .insert({
        tenant_id: agent.tenant_id, // NEVER from frontend
        article_id: validated.article_id,
        is_helpful: validated.is_helpful,
        comment: validated.comment ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath(`/home/kb/${validated.article_id}`);
    return { data: feedback, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
