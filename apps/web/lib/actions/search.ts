'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ─── Types ────────────────────────────────────────────────────────────────

export type SearchEntityType =
  | 'ticket'
  | 'ticket_comment'
  | 'contact'
  | 'agent'
  | 'organization'
  | 'kb'
  | 'problem'
  | 'change'
  | 'asset';

export interface SearchHit {
  entityType: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  rank: number;
  matchedField: string;
  snippet: string;
}

export interface GlobalSearchResponse {
  hits: SearchHit[];
  /** Pre-grouped for UI convenience — same data as `hits` keyed by entity type. */
  groups: Partial<Record<SearchEntityType, SearchHit[]>>;
  total: number;
  elapsedMs: number;
  query: string;
}

const searchInput = z.object({
  query: z.string().trim().min(2).max(120),
  limitPerGroup: z.number().int().min(1).max(20).optional().default(5),
});

// ─── Action ───────────────────────────────────────────────────────────────

export async function globalSearch(
  rawQuery: string,
  options?: { limitPerGroup?: number },
): Promise<{ data: GlobalSearchResponse; error: null } | { data: null; error: string }> {
  const parsed = searchInput.safeParse({
    query: rawQuery,
    limitPerGroup: options?.limitPerGroup,
  });
  if (!parsed.success) {
    return { data: null, error: 'Consulta demasiado corta' };
  }
  const { query, limitPerGroup } = parsed.data;

  const client = getSupabaseServerClient();
  const t0 = Date.now();

  // Cast — the RPC was added in migration 00030, the generated Database
  // types don't include it yet.
  const { data, error } = await (client as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc('search_global', {
    p_query: query,
    p_limit: limitPerGroup,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = ((data ?? []) as Array<{
    entity_type: SearchEntityType;
    entity_id: string;
    title: string;
    subtitle: string | null;
    url: string;
    rank: number;
    matched_field: string;
    snippet: string;
  }>).map((r) => ({
    entityType: r.entity_type,
    id: r.entity_id,
    title: r.title,
    subtitle: r.subtitle,
    url: r.url,
    rank: r.rank,
    matchedField: r.matched_field,
    snippet: r.snippet,
  }));

  const groups: GlobalSearchResponse['groups'] = {};
  for (const hit of rows) {
    const bucket = groups[hit.entityType] ?? [];
    bucket.push(hit);
    groups[hit.entityType] = bucket;
  }

  return {
    data: {
      hits: rows,
      groups,
      total: rows.length,
      elapsedMs: Date.now() - t0,
      query,
    },
    error: null,
  };
}
