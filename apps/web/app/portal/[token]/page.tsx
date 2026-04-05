import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

import { PortalChat } from '../_components/portal-chat';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PortalArticle {
  id: string;
  title: string;
  slug: string;
  view_count: number;
  helpful_votes: number;
  category: { id: string; name: string } | null;
}

/* -------------------------------------------------------------------------- */
/*  Server Component — Chat-first portal landing                               */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const org = await resolveOrgByPortalToken(token);

  return {
    title: `Portal de Soporte | ${org?.name ?? 'NovaDesk'}`,
  };
}

export default async function PortalTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve org by portal_token (service_role bypasses RLS)
  const org = await resolveOrgByPortalToken(token);

  if (!org) {
    notFound();
  }

  const client = getSupabaseServerClient();

  // Fetch published KB articles for context
  let articles: PortalArticle[] = [];

  try {
    const { data } = await client
      .from('kb_articles')
      .select(`
        id, title, slug, view_count, helpful_votes,
        category:kb_categories!kb_articles_category_id_fkey(id, name)
      `)
      .eq('status', 'published')
      .eq('tenant_id', org.tenant_id)
      .order('view_count', { ascending: false })
      .limit(5);

    articles = (data as PortalArticle[]) ?? [];
  } catch {
    // KB may not have articles yet
  }

  // Fetch user info
  let userName: string | null = null;
  let userEmail: string | null = null;
  let ticketCount = 0;

  try {
    const { data: { user } } = await client.auth.getUser();

    if (user) {
      userName =
        user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0] ??
        null;
      userEmail = user.email ?? null;

      const { count } = await client
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .eq('requester_email', user.email)
        .in('status', ['new', 'assigned', 'in_progress', 'pending']);

      ticketCount = count ?? 0;
    }
  } catch {
    // Guest user
  }

  return (
    <PortalChat
      orgId={org.id}
      orgName={org.name}
      orgColors={org.brand_colors}
      userName={userName}
      userEmail={userEmail}
      portalToken={token}
      kbArticles={articles}
      ticketCount={ticketCount}
    />
  );
}
