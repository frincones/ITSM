/**
 * RAG document indexing pipeline.
 * Handles chunking, embedding generation, and storage in knowledge_embeddings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { splitIntoChunks } from './chunker';
import { generateEmbeddings } from './embeddings';

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source_type: string;
  source_id?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Indexes a single document: chunks the content, generates embeddings,
 * and stores them in knowledge_embeddings.
 *
 * Deletes any existing embeddings for the document before re-indexing.
 */
export async function indexDocument(
  client: SupabaseClient,
  tenantId: string,
  document: KnowledgeDocument,
): Promise<{ chunksIndexed: number }> {
  // 1. Remove existing embeddings for this document
  await deleteDocumentEmbeddings(client, document.id);

  // 2. Chunk the content
  const chunks = splitIntoChunks(document.content);
  if (chunks.length === 0) {
    return { chunksIndexed: 0 };
  }

  // 3. Generate embeddings in batches to respect API limits
  const BATCH_SIZE = 100;
  let totalIndexed = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batchChunks);

    // 4. Build rows for insertion
    const rows = batchChunks.map((chunkText, idx) => ({
      document_id: document.id,
      tenant_id: tenantId,
      chunk_index: i + idx,
      chunk_text: chunkText,
      embedding: JSON.stringify(embeddings[idx]),
      metadata: {
        document_title: document.title,
        source_type: document.source_type,
        ...(document.metadata ?? {}),
      },
    }));

    // 5. Insert into knowledge_embeddings
    const { error } = await client
      .from('knowledge_embeddings')
      .insert(rows);

    if (error) {
      throw new Error(
        `Failed to insert embeddings for document ${document.id}: ${error.message}`,
      );
    }

    totalIndexed += batchChunks.length;
  }

  // 6. Update last_synced_at on the knowledge_documents row
  await client
    .from('knowledge_documents')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', document.id);

  return { chunksIndexed: totalIndexed };
}

/**
 * Indexes a KB article by fetching it from kb_articles and creating
 * a corresponding knowledge_document + embeddings.
 */
export async function indexKBArticle(
  client: SupabaseClient,
  tenantId: string,
  articleId: string,
): Promise<{ chunksIndexed: number }> {
  // 1. Fetch the KB article
  const { data: article, error: fetchError } = await client
    .from('kb_articles')
    .select('id, title, content_markdown, slug, tags, category_id, status')
    .eq('id', articleId)
    .single();

  if (fetchError || !article) {
    throw new Error(
      `Failed to fetch KB article ${articleId}: ${fetchError?.message ?? 'Not found'}`,
    );
  }

  // 2. Upsert a knowledge_document entry for this article
  const { data: doc, error: upsertError } = await client
    .from('knowledge_documents')
    .upsert(
      {
        tenant_id: tenantId,
        source_type: 'kb_article',
        source_id: articleId,
        title: article.title,
        content: article.content_markdown,
        metadata: {
          slug: article.slug,
          tags: article.tags,
          category_id: article.category_id,
          status: article.status,
        },
      },
      { onConflict: 'tenant_id,source_type,source_id' },
    )
    .select('id')
    .single();

  if (upsertError || !doc) {
    throw new Error(
      `Failed to upsert knowledge_document for article ${articleId}: ${upsertError?.message ?? 'Unknown error'}`,
    );
  }

  // 3. Index the document
  return indexDocument(client, tenantId, {
    id: doc.id,
    title: article.title,
    content: article.content_markdown,
    source_type: 'kb_article',
    source_id: articleId,
    metadata: {
      slug: article.slug,
      tags: article.tags,
      category_id: article.category_id,
    },
  });
}

/**
 * Reindexes all knowledge_documents for a given tenant.
 * Iterates through each document and re-runs the indexing pipeline.
 */
export async function reindexAllForTenant(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ documentsProcessed: number; totalChunks: number }> {
  // Fetch all documents for the tenant
  const { data: documents, error } = await client
    .from('knowledge_documents')
    .select('id, title, content, source_type, source_id, source_url, metadata')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(
      `Failed to fetch knowledge documents for tenant ${tenantId}: ${error.message}`,
    );
  }

  if (!documents || documents.length === 0) {
    return { documentsProcessed: 0, totalChunks: 0 };
  }

  let totalChunks = 0;

  for (const doc of documents) {
    const result = await indexDocument(client, tenantId, {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      source_type: doc.source_type,
      source_id: doc.source_id ?? undefined,
      source_url: doc.source_url ?? undefined,
      metadata: doc.metadata ?? undefined,
    });
    totalChunks += result.chunksIndexed;
  }

  return { documentsProcessed: documents.length, totalChunks };
}

/**
 * Deletes all embeddings associated with a specific document.
 */
export async function deleteDocumentEmbeddings(
  client: SupabaseClient,
  documentId: string,
): Promise<void> {
  const { error } = await client
    .from('knowledge_embeddings')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    throw new Error(
      `Failed to delete embeddings for document ${documentId}: ${error.message}`,
    );
  }
}
