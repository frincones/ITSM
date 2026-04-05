import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

import { PortalHeader } from '../_components/portal-header';
import { StatusBar } from '../_components/status-bar';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface OrgData {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_colors: { primary?: string; accent?: string } | null;
  ai_context: string | null;
  portal_token: string;
  tenant_id: string;
}

/* -------------------------------------------------------------------------- */
/*  Layout — Resolves organization from portal_token                           */
/* -------------------------------------------------------------------------- */

export default async function PortalTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve org by portal_token (uses service_role to bypass RLS)
  const org = await resolveOrgByPortalToken(token);

  if (!org) {
    notFound();
  }

  const client = getSupabaseServerClient();

  // Count open tickets for current user (if authenticated)
  let ticketCount = 0;
  let userName: string | null = null;

  try {
    const { data: { user } } = await client.auth.getUser();

    if (user) {
      userName =
        user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0] ??
        null;

      const { count } = await client
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .eq('requester_email', user.email)
        .in('status', ['new', 'assigned', 'in_progress', 'pending']);

      ticketCount = count ?? 0;
    }
  } catch {
    // Guest user — no ticket count
  }

  // Check active major incidents
  let hasActiveIncident = false;
  let incidentMessage: string | undefined;

  try {
    const { data } = await client
      .from('tickets')
      .select('id, title')
      .eq('type', 'incident')
      .eq('is_major', true)
      .eq('organization_id', org.id)
      .in('status', ['open', 'in_progress'])
      .limit(1)
      .maybeSingle();

    if (data) {
      hasActiveIncident = true;
      incidentMessage = `Incidente activo: ${data.title}`;
    }
  } catch {
    // No incidents
  }

  return (
    <>
      <PortalHeader
        orgName={org.name}
        orgLogo={org.logo_url}
        orgColors={org.brand_colors}
        userName={userName}
        portalToken={token}
      />

      <main className="flex-1 overflow-hidden">{children}</main>

      <StatusBar
        hasActiveIncident={hasActiveIncident}
        incidentMessage={incidentMessage}
        openTicketCount={ticketCount}
      />
    </>
  );
}
