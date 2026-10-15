// ---------------------------------------------------------------------------
// OAuth 2.1 Authorization Endpoint — consent screen
// ---------------------------------------------------------------------------
// GET /oauth/authorize
//
// The only part of the flow a human sees. It requires an ITSM session:
// Supabase Auth is the identity provider, this page is the authorization
// server's front end, and an unauthenticated visitor is sent to sign in and
// returned here with the query string intact.
//
// Validation happens before anything renders, and an invalid redirect_uri is
// reported on this page rather than redirected to — see authorize.service.ts
// for why that distinction is the security boundary.
// ---------------------------------------------------------------------------

import { redirect } from 'next/navigation';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { resolveRequestOrigin } from '~/lib/mcp/origin';
import { validateAuthorizeRequest } from '~/lib/oauth/authorize.service';
import { resolveClient } from '~/lib/oauth/oauth.service';

import { ConsentScreen } from './_components/consent-screen';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Authorize application',
  // A consent screen in a search index is a phishing aid.
  robots: { index: false, follow: false },
};

function AuthorizeError({
  error,
  description,
}: {
  error: string;
  description: string;
}) {
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-lg font-semibold">This request could not be authorized</h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        <p className="text-muted-foreground mt-4 font-mono text-xs">{error}</p>
        <p className="text-muted-foreground mt-6 text-xs">
          Nothing was shared and no access was granted. Close this window and start the
          connection again from the application.
        </p>
      </div>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Rebuild the query string once: it is both what we validate and what the
  // consent form posts back for re-validation.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const rawQuery = params.toString();

  const ssr = getSupabaseServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  if (!user) {
    // Sign in, then come back to exactly this request.
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/oauth/authorize?${rawQuery}`)}`);
  }

  const { data: agentRow } = await ssr
    .from('agents')
    .select('id, name, email, role, is_active, tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!agentRow) {
    return (
      <AuthorizeError
        error="no_agent_profile"
        description="This account is signed in but has no agent profile in NovaDesk, so there is no workspace to grant access to."
      />
    );
  }

  const agent = agentRow as unknown as {
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean | null;
    tenant_id: string;
  };

  if (agent.is_active === false) {
    return (
      <AuthorizeError
        error="agent_inactive"
        description="This agent account is inactive and cannot grant access."
      />
    );
  }

  // The resource identifier must be byte-identical to the one in
  // /.well-known/oauth-protected-resource, or the audience check at /token
  // and in verify_oauth_token rejects every token this page issues. Both
  // derive it from the forwarded request headers rather than from config,
  // because behind Vercel the configured URL and the actual host can differ.
  const resource = `${await resolveRequestOrigin()}/api/mcp`;

  const admin = getSupabaseServerAdminClient();
  const validation = await validateAuthorizeRequest(admin, params, resource, resolveClient);

  if (validation.kind === 'render_error') {
    return <AuthorizeError error={validation.error} description={validation.description} />;
  }

  if (validation.kind === 'redirect_error') {
    redirect(validation.redirectTo);
  }

  const { client, request } = validation;

  return (
    <ConsentScreen
      rawQuery={rawQuery}
      resource={resource}
      clientName={client.client_name}
      clientUri={client.client_uri}
      clientId={client.client_id}
      isDynamic={!client.client_id.startsWith('https://')}
      redirectUri={request.redirectUri}
      scopes={request.scopes}
      agentName={agent.name}
      agentEmail={agent.email}
      agentRole={agent.role}
    />
  );
}
