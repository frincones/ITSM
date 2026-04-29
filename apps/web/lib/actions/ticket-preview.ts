'use server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export interface PreviewAttachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
}

export interface PreviewFollowup {
  id: string;
  content: string;
  content_html: string | null;
  is_private: boolean;
  created_at: string;
  author_type: string | null;
  author: { id: string; name: string; avatar_url: string | null } | null;
  attachments: PreviewAttachment[];
}

export interface TicketPreviewData {
  followups: PreviewFollowup[];
  total_followups_count: number;
  sla_due_date: string | null;
  sla_breached: boolean;
  first_response_at: string | null;
  open_tasks_count: number;
  relations_count: number;
  followers_count: number;
  is_client: boolean;
}

export interface TicketPreviewResult {
  data: TicketPreviewData | null;
  error: string | null;
}

const PREVIEW_FOLLOWUP_LIMIT = 5;

/**
 * Lazy-loaded data for the workspace ticket preview side panel.
 *
 * Fetches only what the compact panel needs (last 5 followups + a few
 * counters + SLA snapshot) so the workspace page itself stays cheap. RLS
 * filters by tenant; clients additionally never see private notes.
 */
export async function getTicketPreviewData(
  ticketId: string,
): Promise<TicketPreviewResult> {
  try {
    const client = getSupabaseServerClient();

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    const { data: agent } = await client
      .from('agents')
      .select('id, role, tenant_id')
      .eq('user_id', user.id)
      .single();
    if (!agent) return { data: null, error: 'Agent not found' };

    const isClient = agent.role === 'readonly';

    // Verify ticket exists and pull SLA / first_response snapshot at the
    // same time. RLS already enforces tenant isolation so we don't filter
    // by tenant_id explicitly here.
    const { data: ticket, error: ticketError } = await client
      .from('tickets')
      .select('id, sla_due_date, sla_breached, first_response_at')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle();

    if (ticketError || !ticket) {
      return { data: null, error: 'Ticket not found' };
    }

    // Followups: last N. Clients never see private notes.
    let followupQuery = client
      .from('ticket_followups')
      .select(
        'id, content, content_html, is_private, created_at, author_id, author_type',
        { count: 'exact' },
      )
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_FOLLOWUP_LIMIT);

    if (isClient) {
      followupQuery = followupQuery.eq('is_private', false);
    }

    const followupResult = await followupQuery;

    const rawFollowups = (followupResult.data ?? []) as Array<{
      id: string;
      content: string;
      content_html: string | null;
      is_private: boolean;
      created_at: string;
      author_id: string | null;
      author_type: string | null;
    }>;

    // Resolve author names in a single roundtrip. Lookup the auth user_id
    // → agents row. Non-agent authors (system/ai) just render their type.
    const authorIds = Array.from(
      new Set(
        rawFollowups
          .filter((f) => f.author_type === 'agent' && f.author_id)
          .map((f) => f.author_id as string),
      ),
    );

    let authorMap = new Map<
      string,
      { id: string; name: string; avatar_url: string | null }
    >();
    if (authorIds.length > 0) {
      const { data: authors } = await client
        .from('agents')
        .select('id, user_id, name, avatar_url')
        .in('user_id', authorIds);
      for (const a of authors ?? []) {
        if (a.user_id) {
          authorMap.set(a.user_id, {
            id: a.id,
            name: a.name,
            avatar_url: a.avatar_url,
          });
        }
      }
    }

    // Fetch attachments for these followups in one shot. Limit by ticket
    // (RLS already scopes by tenant) to keep the query lean. Legacy rows
    // with no followup_id are excluded — they show up in the full detail
    // timeline via the timestamp heuristic, which we don't replicate here
    // because the compact preview only shows the latest 5 messages anyway.
    const followupIds = rawFollowups.map((f) => f.id);
    const attachmentsByFollowup = new Map<string, PreviewAttachment[]>();
    if (followupIds.length > 0) {
      const { data: rawAttachments } = await client
        .from('ticket_attachments')
        .select('id, file_name, mime_type, file_size, followup_id')
        .eq('ticket_id', ticketId)
        .in('followup_id', followupIds);

      for (const a of (rawAttachments ?? []) as Array<{
        id: string;
        file_name: string;
        mime_type: string | null;
        file_size: number | null;
        followup_id: string | null;
      }>) {
        if (!a.followup_id) continue;
        const list = attachmentsByFollowup.get(a.followup_id) ?? [];
        list.push({
          id: a.id,
          file_name: a.file_name,
          mime_type: a.mime_type,
          file_size: a.file_size,
        });
        attachmentsByFollowup.set(a.followup_id, list);
      }
    }

    const followups: PreviewFollowup[] = rawFollowups.map((f) => ({
      id: f.id,
      content: f.content,
      content_html: f.content_html,
      is_private: f.is_private,
      created_at: f.created_at,
      author_type: f.author_type,
      author:
        f.author_type === 'agent' && f.author_id
          ? authorMap.get(f.author_id) ?? null
          : null,
      attachments: attachmentsByFollowup.get(f.id) ?? [],
    }));

    // Counters in parallel (head: true so only count is fetched).
    const [tasksRes, relationsRes, followersRes] = await Promise.all([
      client
        .from('ticket_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticketId)
        .neq('status', 'done'),
      client
        .from('ticket_relations')
        .select('id', { count: 'exact', head: true })
        .or(`ticket_id.eq.${ticketId},related_ticket_id.eq.${ticketId}`),
      client
        .from('ticket_followers')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticketId),
    ]);

    return {
      data: {
        followups,
        total_followups_count: followupResult.count ?? followups.length,
        sla_due_date: ticket.sla_due_date,
        sla_breached: ticket.sla_breached ?? false,
        first_response_at: ticket.first_response_at,
        open_tasks_count: tasksRes.count ?? 0,
        relations_count: relationsRes.count ?? 0,
        followers_count: followersRes.count ?? 0,
        is_client: isClient,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
