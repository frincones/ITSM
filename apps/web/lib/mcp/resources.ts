// ---------------------------------------------------------------------------
// MCP Resources
// ---------------------------------------------------------------------------
// Resources are addressable, readable context — the things a host app can
// put in front of a model without the model choosing to call anything.
// Tools are actions the model decides to take; resources are material the
// user or the app attaches.
//
// What belongs here, concretely: a knowledge base article, a ticket with its
// thread. What does not: anything that mutates, and anything expensive to
// enumerate.
//
// URI scheme
// ----------
// `novadesk://<kind>/<id>` — a custom scheme per RFC 3986, because these are
// not files and not web pages a client could fetch on its own. The id is
// always a uuid or a ticket number, never a slug, so a URI stays valid when
// something is renamed.
//
// Isolation is identical to tools: every read goes through the same
// MCPContext, so tenant and organization scoping are enforced in exactly one
// place. A resource URI is NOT a capability — holding one does not grant
// access to it.
// ---------------------------------------------------------------------------

import 'server-only';

import type { MCPContext } from './context';
import { McpError, JsonRpcErrorCode, invalidParams } from './errors';

export interface ResourceDescriptor {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: Array<'user' | 'assistant'>;
    priority?: number;
    lastModified?: string;
  };
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

const SCHEME = 'novadesk://';

/** Resource not found — the spec names -32002 for this case. */
function resourceNotFound(uri: string): McpError {
  return new McpError(JsonRpcErrorCode.NotFound, 'Resource not found', 404, { uri });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Parameterised resources. These are what make the catalog usable: listing
 * every ticket as a resource would be unbounded, but a template lets a
 * client construct the URI for the one it wants.
 */
export function listResourceTemplates(): ResourceTemplate[] {
  return [
    {
      uriTemplate: 'novadesk://ticket/{id}',
      name: 'ticket',
      title: 'Ticket',
      description:
        'A ticket with its full comment thread, tasks and solutions, rendered as Markdown. Accepts either the uuid or the ticket number (TKT-2610-00001).',
      mimeType: 'text/markdown',
    },
    {
      uriTemplate: 'novadesk://kb/{id}',
      name: 'kb_article',
      title: 'Knowledge base article',
      description:
        'A knowledge base article in its original Markdown. Accepts the article uuid.',
      mimeType: 'text/markdown',
    },
    {
      uriTemplate: 'novadesk://organization/{id}',
      name: 'organization',
      title: 'Client brief',
      description:
        'A client summary: contact details, support contract terms, SLA targets and current ticket counts.',
      mimeType: 'text/markdown',
    },
  ];
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * The concrete resources worth enumerating.
 *
 * Only published KB articles are listed. Tickets are deliberately absent:
 * there are 714 of them and growing, and a client that renders a resource
 * picker would be handed an unusable list. They remain reachable through the
 * template, which is what templates are for.
 */
export async function listResources(ctx: MCPContext): Promise<ResourceDescriptor[]> {
  ctx.requireScope('kb:read');

  let query = ctx.supabase
    .from('kb_articles')
    .select('id, title, slug, status, is_public, updated_at, organization_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);

  const orgFilter = ctx.resolveOrgFilter();
  if (orgFilter) {
    query = query.or(
      `organization_id.in.(${orgFilter.join(',')}),organization_id.is.null`,
    );
  }

  const { data, error } = await query;
  if (error) throw new McpError(JsonRpcErrorCode.InternalError, error.message, 500);

  return (data ?? []).map((row) => {
    const a = row as {
      id: string;
      title: string;
      is_public: boolean;
      updated_at: string;
    };
    return {
      uri: `${SCHEME}kb/${a.id}`,
      name: a.title,
      title: a.title,
      description: a.is_public
        ? 'Published article, visible to clients in the portal'
        : 'Published article, internal only',
      mimeType: 'text/markdown',
      annotations: {
        audience: ['assistant', 'user'] as Array<'user' | 'assistant'>,
        // Public articles are the ones safe to quote to a client, so they
        // rank higher for a model deciding what to pull in.
        priority: a.is_public ? 0.8 : 0.5,
        lastModified: a.updated_at,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Parses `novadesk://kind/id`, rejecting anything else. */
function parseUri(uri: string): { kind: string; id: string } {
  if (!uri.startsWith(SCHEME)) {
    throw invalidParams(
      `Unsupported URI scheme. Resources use ${SCHEME}<kind>/<id>; see resources/templates/list.`,
    );
  }
  const rest = uri.slice(SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) {
    throw invalidParams(`Malformed resource URI: ${uri}`);
  }
  return { kind: rest.slice(0, slash), id: rest.slice(slash + 1) };
}

export async function readResource(
  ctx: MCPContext,
  uri: string,
): Promise<ResourceContents[]> {
  const { kind, id } = parseUri(uri);

  switch (kind) {
    case 'kb':
      return [await readKbArticle(ctx, uri, id)];
    case 'ticket':
      return [await readTicket(ctx, uri, id)];
    case 'organization':
      return [await readOrganization(ctx, uri, id)];
    default:
      throw invalidParams(
        `Unknown resource kind '${kind}'. Known kinds: ticket, kb, organization.`,
      );
  }
}

async function readKbArticle(
  ctx: MCPContext,
  uri: string,
  id: string,
): Promise<ResourceContents> {
  ctx.requireScope('kb:read');

  let query = ctx.supabase
    .from('kb_articles')
    .select('id, title, content_markdown, status, is_public, tags, updated_at, organization_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null);

  const orgFilter = ctx.resolveOrgFilter();
  if (orgFilter) {
    query = query.or(
      `organization_id.in.(${orgFilter.join(',')}),organization_id.is.null`,
    );
  }

  const { data } = await query.maybeSingle();
  if (!data) throw resourceNotFound(uri);

  const a = data as {
    title: string;
    content_markdown: string | null;
    status: string;
    is_public: boolean;
    tags: string[] | null;
    updated_at: string;
  };

  const header = [
    `# ${a.title}`,
    '',
    `*${a.status}${a.is_public ? ' · visible to clients' : ' · internal'}` +
      `${a.tags?.length ? ` · ${a.tags.join(', ')}` : ''} · updated ${a.updated_at.slice(0, 10)}*`,
    '',
  ].join('\n');

  return {
    uri,
    mimeType: 'text/markdown',
    text: header + (a.content_markdown ?? '_(empty)_'),
  };
}

async function readTicket(
  ctx: MCPContext,
  uri: string,
  id: string,
): Promise<ResourceContents> {
  ctx.requireScope('tickets:read');

  // Accept a ticket number as well as a uuid: it is what a human reading a
  // report actually has in hand.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let query = ctx.supabase
    .from('tickets')
    .select(
      'id, ticket_number, title, description, type, status, urgency, impact, priority, organization_id, requester_email, assigned_agent_id, created_at, updated_at, resolved_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null);

  query = isUuid ? query.eq('id', id) : query.eq('ticket_number', id.toUpperCase());

  const orgFilter = ctx.resolveOrgFilter();
  if (orgFilter) query = query.in('organization_id', orgFilter);

  const { data: ticket } = await query.maybeSingle();
  if (!ticket) throw resourceNotFound(uri);

  const t = ticket as Record<string, string | number | null>;

  const { data: followups } = await ctx.supabase
    .from('ticket_followups')
    .select('content, is_private, author_type, created_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('ticket_id', t.id as string)
    .order('created_at', { ascending: true })
    .limit(100);

  const lines: string[] = [
    `# ${t.ticket_number} — ${t.title}`,
    '',
    `*${t.status} · ${t.type} · urgency ${t.urgency} · impact ${t.impact} · priority ${t.priority}*`,
    `*opened ${String(t.created_at).slice(0, 10)}` +
      `${t.resolved_at ? ` · resolved ${String(t.resolved_at).slice(0, 10)}` : ''}` +
      `${t.requester_email ? ` · requested by ${t.requester_email}` : ''}*`,
    '',
    '## Description',
    '',
    (t.description as string | null) ?? '_(none)_',
  ];

  const thread = (followups ?? []) as Array<{
    content: string | null;
    is_private: boolean;
    author_type: string | null;
    created_at: string;
  }>;

  if (thread.length) {
    lines.push('', `## Thread (${thread.length})`, '');
    for (const f of thread) {
      // Private notes are internal reasoning, not what was said to the
      // client. Marking them keeps a model from quoting one back.
      const tag = f.is_private ? 'internal note' : (f.author_type ?? 'comment');
      lines.push(`**${f.created_at.slice(0, 16).replace('T', ' ')} — ${tag}**`, '');
      lines.push((f.content ?? '').trim() || '_(empty)_', '');
    }
  }

  return { uri, mimeType: 'text/markdown', text: lines.join('\n') };
}

async function readOrganization(
  ctx: MCPContext,
  uri: string,
  id: string,
): Promise<ResourceContents> {
  ctx.requireScope('organizations:read');

  const orgFilter = ctx.resolveOrgFilter([id]);
  if (orgFilter && !orgFilter.includes(id)) throw resourceNotFound(uri);

  const { data: org } = await ctx.supabase
    .from('organizations')
    .select(
      'id, name, slug, industry, contact_name, contact_email, contact_phone, is_active, contract_start, contract_end, notes',
    )
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!org) throw resourceNotFound(uri);
  const o = org as Record<string, string | boolean | null>;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: contracts }, openCount, totalCount] = await Promise.all([
    ctx.supabase
      .from('organization_support_contracts')
      .select('plan_name, monthly_ticket_quota, sla_enabled, cycle_start_day, effective_from, effective_to')
      .eq('tenant_id', ctx.tenantId)
      .eq('organization_id', id)
      .order('effective_from', { ascending: false }),
    ctx.supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('organization_id', id)
      .is('deleted_at', null)
      .not('status', 'in', '(closed,cancelled,resolved)'),
    ctx.supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('organization_id', id)
      .is('deleted_at', null),
  ]);

  const current = ((contracts ?? []) as Array<Record<string, string | number | boolean | null>>)
    .find((c) => {
      const from = (c.effective_from as string | null) ?? '0000-01-01';
      const to = (c.effective_to as string | null) ?? '9999-12-31';
      return from <= today && today <= to;
    });

  const lines = [
    `# ${o.name}`,
    '',
    `*${o.is_active ? 'active' : 'INACTIVE — portal access is cut'}` +
      `${o.industry ? ` · ${o.industry}` : ''}*`,
    '',
    '## Contact',
    '',
    `- Name: ${o.contact_name ?? '_(none)_'}`,
    `- Email: ${o.contact_email ?? '_(none)_'}`,
    `- Phone: ${o.contact_phone ?? '_(none)_'}`,
    '',
    '## Tickets',
    '',
    `- Open: ${openCount.count ?? 0}`,
    `- Total: ${totalCount.count ?? 0}`,
    '',
    '## Support contract',
    '',
  ];

  if (current) {
    lines.push(
      `- Plan: ${current.plan_name ?? '_(unnamed)_'}`,
      `- Monthly quota: ${current.monthly_ticket_quota ?? '_(none)_'} tickets`,
      `- SLA enabled: ${current.sla_enabled ? 'yes' : 'no'}`,
      `- Cycle starts on day ${current.cycle_start_day ?? '_(unset)_'} of the month`,
    );
  } else {
    lines.push('_No contract in force today._');
  }

  if (o.notes) lines.push('', '## Notes', '', o.notes as string);

  return { uri, mimeType: 'text/markdown', text: lines.join('\n') };
}
