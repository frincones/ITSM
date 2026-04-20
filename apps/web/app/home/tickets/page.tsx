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
  }>;
}

export const metadata = {
  title: 'Tickets',
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const params = await searchParams;
  const client = getSupabaseServerClient();
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

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
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Filter by organization (from OrgSelector ?org= param or user context)
  // If no org param → show all (backwards compatible for TDX admin)
  if (params.org) {
    query = query.eq('organization_id', params.org);
  } else {
    // Check if user is an org_user (not TDX agent) → auto-filter by their org
    const { data: { user: authUser } } = await client.auth.getUser();
    if (authUser) {
      const { data: orgUser } = await client
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle();
      if (orgUser?.organization_id) {
        query = query.eq('organization_id', orgUser.organization_id);
      }
    }
  }

  // Apply tab-based filters
  if (params.tab === 'unassigned') {
    query = query.is('assigned_agent_id', null);
  } else if (params.tab === 'overdue') {
    query = query.eq('sla_breached', true);
  } else if (params.tab === 'critical') {
    query = query.gte('priority', 12);
  }

  // Apply search filter
  if (params.search) {
    query = query.or(
      `title.ilike.%${params.search}%,ticket_number.ilike.%${params.search}%`,
    );
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

  // Pagination
  query = query.range(offset, offset + limit - 1);

  // RLS filters automatically by tenant_id
  const { data: tickets, count, error } = await query;

  // Fetch organizations for the "Client" column (id → name map)
  const { data: orgs } = await client
    .from('organizations')
    .select('id, name')
    .eq('is_active', true);

  const organizationMap: Record<string, string> = {};
  if (orgs) {
    for (const org of orgs) {
      organizationMap[org.id] = org.name;
    }
  }

  // Fetch current agent for "Assigned to Me" tab
  const {
    data: { user },
  } = await client.auth.getUser();

  let currentAgentId: string | null = null;

  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single();

    currentAgentId = agent?.id ?? null;
  }

  // Agents list for the multi-select filter (scoped to the tenant)
  const { data: allAgents } = await client
    .from('agents')
    .select('id, name, email, role, avatar_url')
    .eq('is_active', true)
    .order('name');

  return (
    <TicketListClient
      tickets={tickets ?? []}
      totalCount={count ?? 0}
      currentPage={page}
      pageSize={limit}
      currentAgentId={currentAgentId}
      organizationMap={organizationMap}
      agents={allAgents ?? []}
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
