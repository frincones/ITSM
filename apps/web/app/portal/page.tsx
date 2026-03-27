import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { PortalClient } from './_components/portal-client';

export const metadata = {
  title: 'Service Portal',
};

export default async function PortalPage() {
  const client = getSupabaseServerClient();

  // Fetch published KB articles for "Popular Articles" section
  let articles: Array<{
    id: string;
    title: string;
    slug: string;
    view_count: number;
    helpful_votes: number;
    category: { id: string; name: string } | null;
  }> = [];

  try {
    const { data } = await client
      .from('kb_articles')
      .select(
        `
        id,
        title,
        slug,
        view_count,
        helpful_votes,
        category:kb_categories!kb_articles_category_id_fkey(id, name)
      `,
      )
      .eq('status', 'published')
      .order('view_count', { ascending: false })
      .limit(4);

    articles = (data as typeof articles) ?? [];
  } catch {
    // Fallback when tables don't exist yet
  }

  // Fetch service catalog items for quick reference
  let services: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
  }> = [];

  try {
    const { data } = await client
      .from('service_catalog_items')
      .select('id, name, description, category')
      .eq('is_published', true)
      .order('name', { ascending: true })
      .limit(6);

    services = (data as typeof services) ?? [];
  } catch {
    // Fallback when tables don't exist yet
  }

  return <PortalClient articles={articles} services={services} />;
}
