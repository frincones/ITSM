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
      assigned_agent:agents!tickets_assigned_agent_id_fkey(name, avatar_url),
      requester:contacts!tickets_contact_id_fkey(name, email),
      category:categories!tickets_category_id_fkey(name)
    `,
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Apply tab-based filters
  if (params.tab === 'unassigned') {
    query = query.is('assigned_agent_id', null);
  } else if (params.tab === 'overdue') {
    query = query.eq('sla_breached', true);
  } else if (params.tab === 'critical') {
    query = query.eq('priority', 'critical');
  }

  // Apply search filter
  if (params.search) {
    query = query.or(
      `title.ilike.%${params.search}%,ticket_number.ilike.%${params.search}%`,
    );
  }

  // Apply dropdown filters
  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.type) {
    query = query.eq('type', params.type);
  }

  if (params.priority) {
    query = query.eq('priority', params.priority);
  }

  if (params.category) {
    query = query.eq('category_id', params.category);
  }

  if (params.agent) {
    query = query.eq('assigned_agent_id', params.agent);
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

  return (
    <TicketListClient
      tickets={tickets ?? []}
      totalCount={count ?? 0}
      currentPage={page}
      pageSize={limit}
      currentAgentId={currentAgentId}
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
