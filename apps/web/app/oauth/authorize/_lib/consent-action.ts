// ---------------------------------------------------------------------------
// Server Action — OAuth consent decision
// ---------------------------------------------------------------------------
// Runs when the signed-in user approves or denies a client on the consent
// screen.
//
// Everything that matters is re-derived here rather than trusted from the
// form. The browser sends the authorization parameters back, so they are
// re-validated from scratch, and the identity comes from the session cookie
// rather than from any posted field. A server action is a public HTTP
// endpoint: anything the form could set, an attacker could set too.
// ---------------------------------------------------------------------------

'use server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { recordMcpCall } from '~/lib/mcp/audit';
import {
  issueAuthorizationCode,
  validateAuthorizeRequest,
} from '~/lib/oauth/authorize.service';
import { resolveClient } from '~/lib/oauth/oauth.service';

export type ConsentResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function submitConsentAction(input: {
  /** The original query string, echoed by the form and re-validated here. */
  rawQuery: string;
  /** Scopes the user left checked. Intersected with the request downstream. */
  grantedScopes: string[];
  decision: 'approve' | 'deny';
  /** The resource identifier the page resolved from the public origin. */
  resource: string;
}): Promise<ConsentResult> {
  const ssr = getSupabaseServerClient();

  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: 'Your session expired. Sign in and try again.' };

  const { data: agentRow } = await ssr
    .from('agents')
    .select('id, tenant_id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!agentRow) return { ok: false, error: 'No agent profile is linked to this account.' };

  const agent = agentRow as unknown as {
    id: string;
    tenant_id: string;
    role: string;
    is_active: boolean;
  };

  if (!agent.is_active) {
    return { ok: false, error: 'This agent account is inactive.' };
  }

  // A readonly agent may still connect a client, but only to read. Granting
  // write scopes to a token whose agent cannot write in the UI would be a
  // privilege escalation through the MCP server.
  const roleCeiling =
    agent.role === 'readonly'
      ? (s: string) => s.endsWith(':read') || s.endsWith(':search')
      : () => true;

  // Re-validate rather than trusting the form: the parameters made a round
  // trip through the browser, where they could have been edited.
  const admin = getSupabaseServerAdminClient();
  const params = new URLSearchParams(input.rawQuery);
  const validation = await validateAuthorizeRequest(
    admin,
    params,
    input.resource,
    resolveClient,
  );

  if (validation.kind === 'render_error') {
    return { ok: false, error: `${validation.error}: ${validation.description}` };
  }
  if (validation.kind === 'redirect_error') {
    // Still a redirect the client is entitled to receive.
    return { ok: true, redirectTo: validation.redirectTo };
  }

  const { request, client } = validation;

  if (input.decision === 'deny') {
    const url = new URL(request.redirectUri);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'The user declined the authorization request.');
    if (request.state) url.searchParams.set('state', request.state);
    return { ok: true, redirectTo: url.toString() };
  }

  const grantedScopes = input.grantedScopes.filter(roleCeiling);
  if (!grantedScopes.length) {
    return {
      ok: false,
      error:
        'None of the selected permissions are available to your role. A readonly agent can grant read access only.',
    };
  }

  const issued = await issueAuthorizationCode(admin, {
    request,
    userId: user.id,
    agentId: agent.id,
    tenantId: agent.tenant_id,
    grantedScopes,
    // Agents are not org-restricted in this schema (that is an API-key
    // concept), so the grant carries no org filter and RLS governs reach.
    organizationIds: null,
  });

  if (!issued.ok) return { ok: false, error: issued.error };

  // Granting a client access to a workspace is exactly the kind of event
  // someone will later need to reconstruct.
  await recordMcpCall(admin, {
    tenantId: agent.tenant_id,
    apiKeyId: null,
    agentId: agent.id,
    channel: 'oauth',
    toolName: 'oauth/authorize:granted',
    status: 'success',
    statusCode: 200,
    durationMs: 0,
    errorMessage: null,
    ip: null,
    userAgent: null,
    requestId: null,
    arguments: {
      client_id: request.clientId,
      client_name: client.client_name,
      scopes: grantedScopes,
      resource: request.resource,
    },
  });

  return { ok: true, redirectTo: issued.redirectTo };
}
