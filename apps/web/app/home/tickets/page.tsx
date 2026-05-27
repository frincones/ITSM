import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { TicketListClient } from './_components/ticket-list-client';

interface TicketsPageProps {
  searchParams: Promise<{
    page?: string;
    tab?: string;
    search?: string;
    status?: string;
    type?: string;
    priority?: string;
    category?: string;
    agent?: string;
    org?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}

// Maps UI column keys to the actual column (plus foreignTable, when sorting
// by a joined row like `requester` or `assigned_agent`).
const SORT_MAP: Record<string, { col: string; foreign?: string }> = {
  ticket_number: { col: 'ticket_number' },
  title: { col: 'title' },
  type: { col: 'type' },
  status: { col: 'status' },
  priority: { col: 'priority' },
  created_at: { col: 'created_at' },
  requester: { col: 'name', foreign: 'requester' },
  assignee: { col: 'name', foreign: 'assigned_agent' },
};

export const metadata = {
  title: 'Tickets',
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  // Resolve current agent up-front so tab filters like "Assigned to Me" can
  // use it when building the query below.
  const {
    data: { user },
  } = await client.auth.getUser();

  let currentAgentId: string | null = null;
  let isClient = false;
  // List of organization IDs the current user is allowed to see tickets
  // for. `null` means "no restriction" (TDX staff with global access).
  // An empty array means "no orgs" — the query gets short-circuited so
  // no rows leak through.
  let allowedOrgIds: string[] | null = null;

  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('id, role')
      .eq('user_id', user.id)
      .maybeSingle();
    currentAgentId = agent?.id ?? null;
    if (!agent || agent.role === 'readonly') isClient = true;

    // Build the per-user org allowlist. We union:
    //   (a) organizations from organization_users (portal users)
    //   (b) organizations from agent_organizations (readonly agents
    //       explicitly linked to a customer org)
    // TDX staff (admin/supervisor/agent) with NO explicit agent_organizations
    // rows keep global access — that's the historical behavior.
    const [{ data: orgUserRows }, { data: agentOrgRows }] = await Promise.all([
      client
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true),
      agent?.id
        ? client
            .from('agent_organizations')
            .select('organization_id')
            .eq('agent_id', agent.id)
        : Promise.resolve({ data: [] as { organization_id: string }[] }),
    ]);

    const fromOrgUsers = (orgUserRows ?? [])
      .map((r) => r.organization_id as string | null)
      .filter((id): id is string => Boolean(id));
    const fromAgentOrgs = (agentOrgRows ?? [])
      .map((r) => r.organization_id as string | null)
      .filter((id): id is string => Boolean(id));

    if (isClient) {
      // Clients (portal users + readonly agents) MUST be scoped. If the
      // union is empty they can't see anything — better than leaking.
      allowedOrgIds = [...new Set([...fromOrgUsers, ...fromAgentOrgs])];
    } else if (fromAgentOrgs.length > 0) {
      // Staff agents who have been explicitly assigned to specific orgs
      // are scoped to those orgs. Staff without any agent_organizations
      // row keep tenant-wide access (allowedOrgIds stays null).
      allowedOrgIds = [...new Set(fromAgentOrgs)];
    }
  } else {
    // No auth → keep TicketListClient hiding the button
    isClient = true;
    allowedOrgIds = [];
  }

  // Build query with server-side filters
  let query = client
    .from('tickets')
    .select(
      `
      id,
      ticket_number,
      title,
      status,
      type,
      urgency,
      priority,
      channel,
      sla_due_date,
      sla_breached,
      created_at,
      requester_id,
      requester_email,
      assigned_agent_id,
      category_id,
      organization_id,
      custom_fields,
      requester:contacts(id, name, email),
      assigned_agent:agents(id, name, avatar_url, email),
      category:categories!tickets_category_id_fkey(id, name)
`,
      // 'estimated' lets PostgREST use the planner's row estimate for big
      // datasets (cheap) and falls back to an exact count when the result
      // fits on a single page. Switching off 'exact' was the single biggest
      // win against filter/search latency.
      { count: 'estimated' },
    )
    .is('deleted_at', null);

  // Filter by organization. The ?org= URL param is honored ONLY when the
  // user is allowed to see that org — without this check, anyone could
  // type `?org=<other-org-uuid>` and read another customer's tickets.
  // When allowedOrgIds is null, the user has tenant-wide access (TDX
  // staff path) and any org filter passes through.
  if (params.org) {
    if (allowedOrgIds !== null && !allowedOrgIds.includes(params.org)) {
      // Cross-org access attempt — short-circuit with an impossible
      // filter so the page renders the empty state without leaking.
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      query = query.eq('organization_id', params.org);
    }
  } else if (allowedOrgIds !== null) {
    // No explicit org param — restrict to the user's allowed set.
    if (allowedOrgIds.length === 0) {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      query = query.in('organization_id', allowedOrgIds);
    }
  }
  // else: allowedOrgIds === null → tenant-wide access (TDX staff). No
  // additional filter beyond the tenant_id one that RLS already enforces.

  // Apply tab-based filters
  if (params.tab === 'mine') {
    // If the user has no agent row (shouldn't happen in prod) return nothing
    // rather than leaking every ticket.
    if (currentAgentId) {
      query = query.eq('assigned_agent_id', currentAgentId);
    } else {
      query = query.eq('assigned_agent_id', '00000000-0000-0000-0000-000000000000');
    }
  } else if (params.tab === 'unassigned') {
    query = query.is('assigned_agent_id', null);
  } else if (params.tab === 'overdue') {
    query = query.eq('sla_breached', true);
  } else if (params.tab === 'critical') {
    query = query.gte('priority', 12);
  }

  // Apply search filter. We DON'T use search_global anymore for this
  // surface — the RPC scans 9 entity types (tickets, followups, contacts,
  // agents, orgs, kb, problems, changes, assets) which is wasted work
  // when the user is on /home/tickets and clearly wants tickets only.
  //
  // Two direct fast-paths cover every realistic search:
  //   • numeric / "TKT-…" → trigram ILIKE on ticket_number
  //   • free text          → OR of ILIKE on (title, description,
  //                          requester_email, ticket_number)
  //
  // Both use the existing gin_trgm indexes (idx_tickets_number_trgm,
  // idx_tickets_title_trgm) and cost roughly one round-trip each.
  if (params.search && params.search.trim().length >= 2) {
    const rawQuery = params.search.trim();
    const looksLikeTicketNumber = /^(tkt[-_]?|tkt\s)?[\d-]{2,}$/i.test(rawQuery)
      || /^TKT[-_]/i.test(rawQuery);

    // Escape commas, parens and quotes so the .or() filter is safe.
    const escaped = rawQuery.replace(/[(),"]/g, ' ');
    const likePattern = `%${escaped}%`;

    const searchQb = client
      .from('tickets')
      .select('id')
      .is('deleted_at', null)
      .limit(100);

    const { data: matchRows } = await (looksLikeTicketNumber
      ? searchQb.ilike('ticket_number', likePattern)
      : searchQb.or(
          [
            `title.ilike.${likePattern}`,
            `description.ilike.${likePattern}`,
            `requester_email.ilike.${likePattern}`,
            `ticket_number.ilike.${likePattern}`,
          ].join(','),
        ));

    const ticketIds = [
      ...new Set((matchRows ?? []).map((r) => r.id as string)),
    ];

    if (ticketIds.length === 0) {
      // No matches — short-circuit with an impossible filter so the UI
      // renders the empty state instead of everything.
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      query = query.in('id', ticketIds);
    }
  }

  // Apply dropdown filters (accept single or comma-separated multi-value)
  if (params.status) {
    const values = params.status.split(',').map((s) => s.trim()).filter(Boolean);
    if (values.length === 1) query = query.eq('status', values[0]!);
    else if (values.length > 1) query = query.in('status', values);
  }

  if (params.type) {
    const values = params.type.split(',').map((s) => s.trim()).filter(Boolean);
    if (values.length === 1) query = query.eq('type', values[0]!);
    else if (values.length > 1) query = query.in('type', values);
  }

  if (params.priority) {
    query = query.eq('priority', params.priority);
  }

  if (params.category) {
    query = query.eq('category_id', params.category);
  }

  if (params.agent) {
    const values = params.agent.split(',').map((s) => s.trim()).filter(Boolean);
    if (values.length === 1) {
      if (values[0] === 'unassigned') query = query.is('assigned_agent_id', null);
      else query = query.eq('assigned_agent_id', values[0]!);
    } else if (values.length > 1) {
      const hasUnassigned = values.includes('unassigned');
      const realIds = values.filter((v) => v !== 'unassigned');
      if (hasUnassigned && realIds.length > 0) {
        query = query.or(
          `assigned_agent_id.is.null,assigned_agent_id.in.(${realIds.join(',')})`,
        );
      } else if (hasUnassigned) {
        query = query.is('assigned_agent_id', null);
      } else {
        query = query.in('assigned_agent_id', realIds);
      }
    }
  }

  // Date range filter
  if (params.from) {
    query = query.gte('created_at', params.from);
  }

  if (params.to) {
    query = query.lte('created_at', params.to);
  }

  // Sort: default is "open first (by closed_at desc nulls first), then
  // by created_at desc" — kept as the fallback so the list behaves like
  // before when the user hasn't chosen a column.
  const sortCfg = params.sort ? SORT_MAP[params.sort] : undefined;
  const ascending = params.dir !== 'desc';

  if (sortCfg) {
    if (sortCfg.foreign) {
      query = query.order(sortCfg.col, {
        foreignTable: sortCfg.foreign,
        ascending,
      });
    } else {
      query = query.order(sortCfg.col, { ascending });
    }
  } else {
    query = query
      .order('closed_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false });
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  // The list query depends on the org allowlist + filters resolved above.
  // The other two ("Client" column source + agent filter dropdown) are
  // independent — fly them in parallel instead of waiting on the list
  // first. This shaves two sequential round-trips on every page render
  // (≈200–400ms on a remote dev session).
  const [
    { data: tickets, count, error },
    { data: orgs },
    { data: allAgents },
  ] = await Promise.all([
    query,
    client.from('organizations').select('id, name').eq('is_active', true),
    client
      .from('agents')
      .select('id, name, email, role, avatar_url')
      .eq('is_active', true)
      .order('name'),
  ]);

  const organizationMap: Record<string, string> = {};
  if (orgs) {
    for (const org of orgs) {
      organizationMap[org.id] = org.name;
    }
  }

  return (
    <TicketListClient
      tickets={tickets ?? []}
      totalCount={count ?? 0}
      currentPage={page}
      pageSize={limit}
      currentAgentId={currentAgentId}
      organizationMap={organizationMap}
      agents={allAgents ?? []}
      isClient={isClient}
      activeTab={params.tab ?? 'all'}
      searchQuery={params.search ?? ''}
      filters={{
        status: params.status ?? '',
        type: params.type ?? '',
        priority: params.priority ?? '',
        category: params.category ?? '',
        agent: params.agent ?? '',
        from: params.from ?? '',
        to: params.to ?? '',
      }}
    />
  );
}
