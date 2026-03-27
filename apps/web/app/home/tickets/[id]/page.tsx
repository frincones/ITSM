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

  // ---------- Fetch ticket with related data ----------
  const { data: ticket, error } = await client
    .from('tickets')
    .select(
      `
      *,
      assigned_agent:agents!tickets_assigned_agent_id_fkey(id, name, avatar_url, email),
      assigned_group:groups!tickets_assigned_group_id_fkey(id, name),
      category:categories!tickets_category_id_fkey(id, name)
    `,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !ticket) {
    notFound();
  }

  // ---------- Fetch followups ----------
  const { data: followups } = await client
    .from('ticket_followups')
    .select('*, author:agents!ticket_followups_created_by_fkey(id, name, avatar_url)')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  // ---------- Fetch tasks ----------
  const { data: tasks } = await client
    .from('ticket_tasks')
    .select('*, assigned_agent:agents!ticket_tasks_assigned_agent_id_fkey(id, name, avatar_url)')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  // ---------- Fetch solutions ----------
  const { data: solutions } = await client
    .from('ticket_solutions')
    .select('*, author:agents!ticket_solutions_created_by_fkey(id, name, avatar_url)')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  // ---------- Fetch attachments ----------
  const { data: attachments } = await client
    .from('ticket_attachments')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  // ---------- Fetch requester contact info ----------
  let requester = null;

  if (ticket.requester_email) {
    const { data } = await client
      .from('contacts')
      .select('id, name, email, phone, company, title')
      .eq('email', ticket.requester_email)
      .single();

    requester = data;
  }

  // ---------- Fetch agents for assignment dropdown ----------
  const { data: agents } = await client
    .from('agents')
    .select('id, name, avatar_url, email')
    .eq('tenant_id', ticket.tenant_id)
    .order('name');

  // ---------- Fetch groups for assignment dropdown ----------
  const { data: groups } = await client
    .from('groups')
    .select('id, name')
    .eq('tenant_id', ticket.tenant_id)
    .order('name');

  // ---------- Fetch categories for dropdown ----------
  const { data: categories } = await client
    .from('categories')
    .select('id, name')
    .eq('tenant_id', ticket.tenant_id)
    .order('name');

  return (
    <TicketDetailClient
      ticket={ticket}
      followups={followups ?? []}
      tasks={tasks ?? []}
      solutions={solutions ?? []}
      attachments={attachments ?? []}
      requester={requester}
      agents={agents ?? []}
      groups={groups ?? []}
      categories={categories ?? []}
    />
  );
}
