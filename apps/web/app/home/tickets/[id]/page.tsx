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
  const client = getSupabaseServerClient();

  // ---------- Fetch ticket (plain, no joins) ----------
  const { data: ticket, error } = await client
    .from('tickets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !ticket) {
    notFound();
  }

  // ---------- Fetch related data in parallel ----------
  const [
    followupsResult,
    tasksResult,
    solutionsResult,
    attachmentsResult,
    agentsResult,
    groupsResult,
    categoriesResult,
  ] = await Promise.all([
    client
      .from('ticket_followups')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('ticket_tasks')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('ticket_solutions')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('agents')
      .select('id, name, avatar_url, email')
      .order('name'),
    client
      .from('groups')
      .select('id, name')
      .order('name'),
    client
      .from('categories')
      .select('id, name')
      .order('name'),
  ]);

  // ---------- Resolve assigned agent name ----------
  let assignedAgent = null;
  if (ticket.assigned_agent_id) {
    const match = agentsResult.data?.find(
      (a: any) => a.id === ticket.assigned_agent_id,
    );
    assignedAgent = match ?? null;
  }

  // ---------- Resolve assigned group name ----------
  let assignedGroup = null;
  if (ticket.assigned_group_id) {
    const match = groupsResult.data?.find(
      (g: any) => g.id === ticket.assigned_group_id,
    );
    assignedGroup = match ?? null;
  }

  // ---------- Resolve category name ----------
  let category = null;
  if (ticket.category_id) {
    const match = categoriesResult.data?.find(
      (c: any) => c.id === ticket.category_id,
    );
    category = match ?? null;
  }

  // ---------- Fetch requester contact info ----------
  let requester = null;
  if (ticket.requester_email) {
    const { data } = await client
      .from('contacts')
      .select('id, name, email, phone, company')
      .eq('email', ticket.requester_email)
      .maybeSingle();
    requester = data;
  }

  // Attach resolved relations to ticket object
  const enrichedTicket = {
    ...ticket,
    assigned_agent: assignedAgent,
    assigned_group: assignedGroup,
    category: category,
  };

  return (
    <TicketDetailClient
      ticket={enrichedTicket}
      followups={followupsResult.data ?? []}
      tasks={tasksResult.data ?? []}
      solutions={solutionsResult.data ?? []}
      attachments={attachmentsResult.data ?? []}
      requester={requester}
      agents={agentsResult.data ?? []}
      groups={groupsResult.data ?? []}
      categories={categoriesResult.data ?? []}
    />
  );
}
