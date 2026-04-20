import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { TicketDetailClient } from './_components/ticket-detail-client';

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { id } = await params;
  console.log('[TicketDetail] Loading ticket:', id);

  const client = getSupabaseServerClient();

  // ---------- Fetch ticket ----------
  const { data: ticket, error: ticketError } = await client
    .from('tickets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  console.log('[TicketDetail] Ticket query result:', {
    hasData: !!ticket,
    error: ticketError?.message ?? null,
    ticketId: ticket?.id,
    title: ticket?.title,
    status: ticket?.status,
  });

  if (ticketError || !ticket) {
    console.error('[TicketDetail] Ticket not found, calling notFound()');
    notFound();
  }

  // ---------- Resolve current user role ----------
  const { data: { user: authUser } } = await client.auth.getUser();
  let userRole: 'admin' | 'agent' | 'client' = 'client';
  if (authUser) {
    const { data: agentRecord } = await client
      .from('agents')
      .select('role')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (agentRecord?.role === 'admin' || agentRecord?.role === 'supervisor') {
      userRole = 'admin';
    } else if (agentRecord?.role === 'agent') {
      userRole = 'agent';
    } else {
      userRole = 'client'; // readonly or org_user
    }
  }

  // ---------- Fetch related data ----------
  console.log('[TicketDetail] Fetching related data...');

  const [
    followupsResult,
    tasksResult,
    solutionsResult,
    attachmentsResult,
    staffAgentsResult,
    groupsResult,
    categoriesResult,
    organizationsResult,
    orgUsersOfTicketOrg,
    agentOrgLinks,
  ] = await Promise.all([
    client.from('ticket_followups').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
    client.from('ticket_tasks').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
    client.from('ticket_solutions').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
    client.from('ticket_attachments').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
    // TDX staff — always available as assignees
    client
      .from('agents')
      .select('id, user_id, name, avatar_url, email, role')
      .in('role', ['admin', 'supervisor', 'agent'])
      .eq('is_active', true)
      .order('name'),
    client.from('groups').select('id, name').order('name'),
    client.from('categories').select('id, name').order('name'),
    client.from('organizations').select('id, name').eq('is_active', true).order('name'),
    // Users of the ticket's organization (scoped view)
    ticket.organization_id
      ? client
          .from('organization_users')
          .select('user_id')
          .eq('organization_id', ticket.organization_id)
          .eq('is_active', true)
          .not('user_id', 'is', null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    // Agents explicitly linked to the ticket's org
    ticket.organization_id
      ? client
          .from('agent_organizations')
          .select('agent_id')
          .eq('organization_id', ticket.organization_id)
      : Promise.resolve({ data: [] as { agent_id: string }[] }),
  ]);

  // Merge: TDX staff + any agents belonging to the ticket's org (readonly clients of that org,
  // plus agents explicitly linked via agent_organizations).
  const staffAgents = staffAgentsResult.data ?? [];
  const orgUserIds = new Set(
    (orgUsersOfTicketOrg.data ?? []).map((r: any) => r.user_id as string),
  );
  const linkedAgentIds = new Set(
    (agentOrgLinks.data ?? []).map((r: any) => r.agent_id as string),
  );

  let scopedReadonlyAgents: typeof staffAgents = [];
  if (orgUserIds.size > 0 || linkedAgentIds.size > 0) {
    const { data: orgReadonly } = await client
      .from('agents')
      .select('id, user_id, name, avatar_url, email, role')
      .eq('is_active', true)
      .eq('role', 'readonly')
      .or(
        [
          orgUserIds.size > 0
            ? `user_id.in.(${[...orgUserIds].join(',')})`
            : null,
          linkedAgentIds.size > 0
            ? `id.in.(${[...linkedAgentIds].join(',')})`
            : null,
        ]
          .filter(Boolean)
          .join(','),
      );
    scopedReadonlyAgents = orgReadonly ?? [];
  }

  const mergedAgentsMap = new Map<string, (typeof staffAgents)[number]>();
  [...staffAgents, ...scopedReadonlyAgents].forEach((a) => {
    if (a?.id) mergedAgentsMap.set(a.id, a);
  });
  const agentsResult = {
    data: [...mergedAgentsMap.values()].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    ),
    error: staffAgentsResult.error,
  };

  console.log('[TicketDetail] Related data:', {
    followups: followupsResult.data?.length ?? 0,
    followupsError: followupsResult.error?.message ?? null,
    tasks: tasksResult.data?.length ?? 0,
    solutions: solutionsResult.data?.length ?? 0,
    attachments: attachmentsResult.data?.length ?? 0,
    agents: agentsResult.data?.length ?? 0,
    agentsError: agentsResult.error?.message ?? null,
    groups: groupsResult.data?.length ?? 0,
    categories: categoriesResult.data?.length ?? 0,
  });

  // ---------- Resolve relations safely ----------
  const assignedAgent = ticket.assigned_agent_id
    ? (agentsResult.data ?? []).find((a: any) => a.id === ticket.assigned_agent_id) ?? null
    : null;

  const assignedGroup = ticket.assigned_group_id
    ? (groupsResult.data ?? []).find((g: any) => g.id === ticket.assigned_group_id) ?? null
    : null;

  const category = ticket.category_id
    ? (categoriesResult.data ?? []).find((c: any) => c.id === ticket.category_id) ?? null
    : null;

  // ---------- Requester ----------
  let requester = null;
  if (ticket.requester_email) {
    const { data } = await client
      .from('contacts')
      .select('id, name, email, phone, company')
      .eq('email', ticket.requester_email)
      .maybeSingle();
    requester = data;
  }

  // ---------- Portal conversation (chat history) ----------
  let portalConversation: any[] = [];
  const { data: conversations } = await client
    .from('inbox_conversations')
    .select('id')
    .eq('ticket_id', id)
    .limit(1);

  if (conversations?.[0]?.id) {
    const { data: msgs } = await client
      .from('inbox_messages')
      .select('id, direction, sender_type, content_text, attachments, metadata, created_at')
      .eq('conversation_id', conversations[0].id)
      .order('created_at', { ascending: true });
    portalConversation = msgs ?? [];
  }

  // ---------- Portal activity log ----------
  let portalActivity: any[] = [];
  if (ticket.requester_email) {
    const { data: activity } = await client
      .from('portal_activity_log')
      .select('id, event_type, event_data, page_url, created_at, session_id')
      .eq('organization_id', ticket.organization_id)
      .eq('user_email', ticket.requester_email)
      .order('created_at', { ascending: true })
      .limit(100);
    portalActivity = activity ?? [];
  }

  console.log('[TicketDetail] Resolved relations:', {
    assignedAgent: assignedAgent?.name ?? null,
    assignedGroup: assignedGroup?.name ?? null,
    category: category?.name ?? null,
    requester: requester?.name ?? null,
  });

  // ---------- Build safe enriched ticket ----------
  const enrichedTicket = {
    id: ticket.id ?? '',
    ticket_number: ticket.ticket_number ?? '',
    title: ticket.title ?? 'Untitled',
    description: ticket.description ?? '',
    status: ticket.status ?? 'new',
    type: ticket.type ?? 'incident',
    urgency: ticket.urgency ?? 'medium',
    impact: ticket.impact ?? 'medium',
    priority: ticket.priority ?? 3,
    channel: ticket.channel ?? null,
    tags: ticket.tags ?? [],
    tenant_id: ticket.tenant_id ?? '',
    created_at: ticket.created_at ?? new Date().toISOString(),
    updated_at: ticket.updated_at ?? null,
    first_response_at: ticket.first_response_at ?? null,
    resolved_at: ticket.resolved_at ?? null,
    closed_at: ticket.closed_at ?? null,
    sla_due_date: ticket.sla_due_date ?? null,
    sla_breached: ticket.sla_breached ?? false,
    requester_email: ticket.requester_email ?? null,
    assigned_agent_id: ticket.assigned_agent_id ?? null,
    assigned_group_id: ticket.assigned_group_id ?? null,
    category_id: ticket.category_id ?? null,
    organization_id: ticket.organization_id ?? null,
    assigned_agent: assignedAgent,
    assigned_group: assignedGroup,
    category: category,
    organization: ticket.organization_id
      ? (organizationsResult.data ?? []).find((o: any) => o.id === ticket.organization_id) ?? null
      : null,
    ai_classification: ticket.ai_classification ?? null,
    ai_summary: ticket.ai_summary ?? null,
    ai_suggested_solution: ticket.ai_suggested_solution ?? null,
  };

  console.log('[TicketDetail] Rendering with enrichedTicket:', {
    id: enrichedTicket.id,
    title: enrichedTicket.title,
    status: enrichedTicket.status,
    type: enrichedTicket.type,
  });

  return (
    <TicketDetailClient
      ticket={enrichedTicket}
      followups={userRole === 'client'
        ? (followupsResult.data ?? []).filter((f: any) => !f.is_private)
        : (followupsResult.data ?? [])}
      tasks={tasksResult.data ?? []}
      solutions={solutionsResult.data ?? []}
      attachments={attachmentsResult.data ?? []}
      requester={requester}
      agents={agentsResult.data ?? []}
      groups={groupsResult.data ?? []}
      categories={categoriesResult.data ?? []}
      organizations={organizationsResult.data ?? []}
      portalConversation={portalConversation}
      portalActivity={portalActivity}
      userRole={userRole}
    />
  );
}
