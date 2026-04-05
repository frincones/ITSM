import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clock, Eye, ThumbsUp, ThumbsDown } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

export default async function PortalKBArticlePage({
  params,
}: {
  params: Promise<{ token: string; slug: string }>;
}) {
  const { token, slug } = await params;
  const org = await resolveOrgByPortalToken(token);
  if (!org) notFound();

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: article } = await svc
    .from('kb_articles')
    .select('*, category:kb_categories!kb_articles_category_id_fkey(id, name)')
    .eq('tenant_id', org.tenant_id)
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!article) notFound();

  // Increment view count
  await svc.from('kb_articles')
    .update({ view_count: (article.view_count ?? 0) + 1 })
    .eq('id', article.id)
    .catch(() => {});

  // Fetch related articles (same category)
  const { data: related } = await svc
    .from('kb_articles')
    .select('id, title, slug')
    .eq('tenant_id', org.tenant_id)
    .eq('status', 'published')
    .eq('category_id', article.category_id)
    .neq('id', article.id)
    .limit(3);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/portal/${token}/kb`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Base de Conocimiento</Button>
        </Link>
      </div>

      <article>
        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            {article.category && (
              <Badge variant="secondary">{(article.category as any).name}</Badge>
            )}
            {article.tags?.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
            ))}
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {article.title}
          </h1>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {article.published_at ? new Date(article.published_at).toLocaleDateString('es') : new Date(article.created_at).toLocaleDateString('es')}
            </span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{article.view_count} vistas</span>
          </div>
        </div>

        {/* Content */}
        <Card className="mb-6">
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {article.content_markdown ?? article.content_html ?? 'Sin contenido'}
            </div>
          </CardContent>
        </Card>

        {/* Feedback */}
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Te fue util este articulo?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ThumbsUp className="h-3.5 w-3.5" /> Si ({article.helpful_count ?? 0})
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ThumbsDown className="h-3.5 w-3.5" /> No ({article.not_helpful_count ?? 0})
              </Button>
            </div>
          </CardContent>
        </Card>
      </article>

      {/* Related */}
      {related && related.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-500">Articulos relacionados</h3>
          <div className="space-y-2">
            {related.map((r: any) => (
              <Link key={r.id} href={`/portal/${token}/kb/${r.slug}`}
                    className="block rounded-lg border p-3 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
