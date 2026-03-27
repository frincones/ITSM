import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { KnowledgeBaseClient } from './_components/kb-client';

interface KBPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
  }>;
}

export const metadata = {
  title: 'Knowledge Base',
};

export default async function KnowledgeBasePage({ searchParams }: KBPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();

  // Fetch KB categories with article counts
  const { data: categories } = await client
    .from('kb_categories')
    .select('id, name, description, slug')
    .order('name', { ascending: true });

  // Build article query
  let articleQuery = client
    .from('kb_articles')
    .select(
      `
      id,
      title,
      slug,
      status,
      view_count,
      helpful_count,
      not_helpful_count,
      updated_at,
      created_at,
      category_id
    `,
    )
    .eq('status', 'published')
    .order('updated_at', { ascending: false });

  // Search filter
  if (params.search) {
    articleQuery = articleQuery.or(
      `title.ilike.%${params.search}%,slug.ilike.%${params.search}%`,
    );
  }

  // Category filter
  if (params.category) {
    articleQuery = articleQuery.eq('category_id', params.category);
  }

  const { data: articles } = await articleQuery;

  // Compute category article counts from fetched data
  const categoryCounts: Record<string, number> = {};
  if (articles) {
    articles.forEach((article) => {
      const catId = (article.category as { id: string; name: string } | null)?.id;
      if (catId) {
        categoryCounts[catId] = (categoryCounts[catId] ?? 0) + 1;
      }
    });
  }

  return (
    <KnowledgeBaseClient
      categories={
        (categories ?? []).map((c) => ({
          ...c,
          article_count: categoryCounts[c.id] ?? 0,
        }))
      }
      articles={articles ?? []}
      searchQuery={params.search ?? ''}
      activeCategory={params.category ?? ''}
    />
  );
}
