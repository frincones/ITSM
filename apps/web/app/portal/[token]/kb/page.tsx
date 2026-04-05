import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, BookOpen, Search, Eye, ThumbsUp } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const org = await resolveOrgByPortalToken(token);
  return { title: `Base de Conocimiento | ${org?.name ?? 'NovaDesk'}` };
}

export default async function PortalKBPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const org = await resolveOrgByPortalToken(token);
  if (!org) notFound();

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Fetch categories
  const { data: categories } = await svc
    .from('kb_categories')
    .select('id, name, slug')
    .eq('tenant_id', org.tenant_id)
    .order('name');

  // Fetch articles
  let articlesQuery = svc
    .from('kb_articles')
    .select('id, title, slug, view_count, helpful_count, tags, published_at, category_id, category:kb_categories!kb_articles_category_id_fkey(id, name)')
    .eq('tenant_id', org.tenant_id)
    .eq('status', 'published')
    .order('view_count', { ascending: false })
    .limit(30);

  if (query.search) {
    articlesQuery = articlesQuery.ilike('title', `%${query.search}%`);
  }

  if (query.category) {
    articlesQuery = articlesQuery.eq('category_id', query.category);
  }

  const { data: articles } = await articlesQuery;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/portal/${token}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
        </Link>
        <BookOpen className="h-5 w-5 text-gray-400" />
        <h1 className="text-lg font-semibold">Base de Conocimiento</h1>
      </div>

      {/* Search */}
      <form className="mb-6" method="get">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            name="search"
            defaultValue={query.search}
            placeholder="Buscar articulos..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </form>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href={`/portal/${token}/kb`}>
            <Badge variant={!query.category ? 'default' : 'outline'} className="cursor-pointer">
              Todos
            </Badge>
          </Link>
          {categories.map((c: any) => (
            <Link key={c.id} href={`/portal/${token}/kb?category=${c.id}`}>
              <Badge variant={query.category === c.id ? 'default' : 'outline'} className="cursor-pointer">
                {c.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Articles */}
      {(!articles || articles.length === 0) ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500">
              {query.search ? `No se encontraron artículos para "${query.search}"` : 'No hay artículos publicados aun'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((a: any) => (
            <Link key={a.id} href={`/portal/${token}/kb/${a.slug}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-2">
                    {a.category && (
                      <Badge variant="secondary" className="text-[10px]">{(a.category as any).name}</Badge>
                    )}
                    {a.tags?.slice(0, 2).map((t: string) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{a.view_count}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{a.helpful_count}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
