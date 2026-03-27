import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CatalogClient } from './_components/catalog-client';

export const metadata = {
  title: 'Service Catalog',
};

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon_name: string | null;
  approval_required: boolean;
  estimated_time: string | null;
  is_published: boolean;
}

export default async function ServiceCatalogPage() {
  const client = getSupabaseServerClient();

  let services: ServiceItem[] = [];
  let categories: string[] = [];

  try {
    const { data } = await client
      .from('service_catalog_items')
      .select(
        'id, name, description, category, icon_name, approval_required, estimated_time, is_published',
      )
      .eq('is_published', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    services = (data as ServiceItem[]) ?? [];

    // Extract unique categories
    const catSet = new Set(services.map((s) => s.category).filter(Boolean));
    categories = Array.from(catSet);
  } catch {
    // Fallback when table doesn't exist yet
  }

  return <CatalogClient services={services} categories={categories} />;
}
