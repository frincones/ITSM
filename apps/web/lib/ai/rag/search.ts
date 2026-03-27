/**
 * RAG semantic search utilities.
 * Generates embeddings for queries and calls the match_knowledge RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

interface SearchOptions {
  /** Minimum similarity threshold (0-1). Default: 0.5 */
  matchThreshold?: number;
  /** Maximum number of results. Default: 10 */
  matchCount?: number;
}

interface SearchResult {
  id: string;
  chunk_text: string;
  similarity: number;
  document_id: string;
  metadata: Record<string, unknown>;
}

/**
 * Performs semantic search over knowledge_embeddings for a tenant.
 *
 * 1. Generates an embedding for the query text.
 * 2. Calls the match_knowledge RPC function.
 * 3. Returns results ranked by cosine similarity.
 */
export async function searchKnowledge(
  client: SupabaseClient,
  query: string,
  tenantId: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const matchThreshold = options?.matchThreshold ?? 0.5;
  const matchCount = options?.matchCount ?? 10;

  // 1. Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // 2. Call the match_knowledge RPC
  const { data, error } = await client.rpc('match_knowledge', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: matchThreshold,
    match_count: matchCount,
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return (data as SearchResult[]) ?? [];
}

/**
 * Searches knowledge base and formats results as a context string
 * suitable for injection into an LLM system/user prompt.
 *
 * Returns an empty string if no relevant results are found.
 */
export async function searchAndFormat(
  client: SupabaseClient,
  query: string,
  tenantId: string,
  options?: SearchOptions,
): Promise<string> {
  const results = await searchKnowledge(client, query, tenantId, options);

  if (results.length === 0) {
    return '';
  }

  const formattedChunks = results.map((result, index) => {
    const title =
      (result.metadata?.document_title as string) ?? 'Unknown source';
    const similarity = (result.similarity * 100).toFixed(1);

    return [
      `--- Source ${index + 1} (${similarity}% match): ${title} ---`,
      result.chunk_text,
    ].join('\n');
  });

  return [
    'Relevant knowledge base context:',
    '',
    ...formattedChunks,
    '',
    '--- End of knowledge base context ---',
  ].join('\n');
}
