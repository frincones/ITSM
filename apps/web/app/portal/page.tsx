import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { PortalChat } from './_components/portal-chat';
import { PortalHeader } from './_components/portal-header';
import { StatusBar } from './_components/status-bar';

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

interface OrgData {
  id: string;
  name: string;
  logo_url?: string | null;
  brand_colors?: { primary?: string; accent?: string } | null;
}

/* -------------------------------------------------------------------------- */
/*  Server Component                                                           */
/* -------------------------------------------------------------------------- */

export const metadata = {
  title: 'Portal de Soporte | NovaDesk',
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const params = await searchParams;
  const client = getSupabaseServerClient();

  /* ---- Resolve organization ---- */
  let org: OrgData = {
    id: 'default',
    name: 'NovaDesk',
    logo_url: null,
    brand_colors: null,
  };

  if (params.org) {
    try {
      const { data } = await client
        .from('organizations')
        .select('id, name, logo_url, brand_colors')
        .or(`slug.eq.${params.org},id.eq.${params.org}`)
        .single();

      if (data) {
        org = data as OrgData;
      }
    } catch {
      // Fallback to default org
    }
  } else {
    // Try to get the first org if none specified
    try {
      const { data } = await client
        .from('organizations')
        .select('id, name, logo_url, brand_colors')
        .limit(1)
        .single();

      if (data) {
        org = data as OrgData;
      }
    } catch {
      // Use defaults
    }
  }

  /* ---- Fetch published KB articles (org + global) ---- */
  let articles: PortalArticle[] = [];

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
      .limit(5);

    articles = (data as PortalArticle[]) ?? [];
  } catch {
    // Tables may not exist yet
  }

  /* ---- Fetch user info & ticket count ---- */
  let userName: string | null = null;
  let userAvatar: string | null = null;
  let ticketCount = 0;

  try {
    const {
      data: { user },
    } = await client.auth.getUser();

    if (user) {
      userName =
        user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0] ??
        null;
      userAvatar = user.user_metadata?.avatar_url ?? null;

      // Count open tickets for user
      const { count } = await client
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .in('status', ['open', 'in_progress', 'pending']);

      ticketCount = count ?? 0;
    }
  } catch {
    // Guest user
  }

  /* ---- Check active incidents ---- */
  let hasActiveIncident = false;
  let incidentMessage: string | undefined;

  try {
    const { data } = await client
      .from('tickets')
      .select('id, title')
      .eq('type', 'incident')
      .eq('is_major', true)
      .in('status', ['open', 'in_progress'])
      .limit(1)
      .single();

    if (data) {
      hasActiveIncident = true;
      incidentMessage = `Incidente activo: ${data.title}`;
    }
  } catch {
    // No active incidents
  }

  /* ---- Render ---- */
  return (
    <>
      <PortalHeader
        orgName={org.name}
        orgLogo={org.logo_url}
        orgColors={org.brand_colors}
        userName={userName}
        userAvatar={userAvatar}
      />

      <main className="flex-1 overflow-hidden">
        <PortalChat
          orgId={org.id}
          orgName={org.name}
          orgColors={org.brand_colors}
          userName={userName}
          kbArticles={articles}
          ticketCount={ticketCount}
        />
      </main>

      <StatusBar
        hasActiveIncident={hasActiveIncident}
        incidentMessage={incidentMessage}
        openTicketCount={ticketCount}
      />
    </>
  );
}
