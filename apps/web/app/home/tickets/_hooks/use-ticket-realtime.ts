'use client';

import { useRefreshOnFocus } from '~/lib/hooks/use-refresh-on-focus';

/**
 * Raw `tickets` row shape, as the list and workspace views map it into their
 * own row types.
 *
 * We intentionally keep this permissive — individual views will cast to
 * their own row type after merging.
 */
export interface RealtimeTicketRow {
  id: string;
  tenant_id: string;
  ticket_number: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  urgency: string;
  impact: string;
  priority: number | string | null;
  channel: string | null;
  assigned_agent_id: string | null;
  assigned_group_id: string | null;
  category_id: string | null;
  organization_id: string | null;
  requester_id: string | null;
  requester_email: string | null;
  sla_due_date: string | null;
  sla_breached: boolean | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
  resolved_at: string | null;
  deleted_at: string | null;
  custom_fields: Record<string, unknown> | null;
  tags: string[] | null;
  // Any extra column that exists in tickets passes through here.
  [key: string]: unknown;
}

interface UseTicketRealtimeOptions {
  channelKey: string;
  filter?: string;
  onInsert: (row: RealtimeTicketRow) => void;
  onUpdate: (
    newRow: RealtimeTicketRow,
    oldRow: Partial<RealtimeTicketRow>,
  ) => void;
}

/**
 * Keeps the ticket list / workspace fresh by re-fetching when the user
 * returns to the tab.
 *
 * This used to subscribe to postgres_changes on `tickets`. That kept a
 * Realtime worker polling the WAL ~2×/second around the clock — 76% of all
 * DB time on prod for ~4 tickets a day — so migration 00088 took `tickets`
 * out of the publication. Both callers already sync their local state from
 * server props, so a refresh is all they need.
 *
 * The handler options are accepted but unused, so the callers keep compiling
 * unchanged; removing them along with their row-mapping code is a follow-up.
 */
export function useTicketRealtime(_opts: UseTicketRealtimeOptions): void {
  useRefreshOnFocus();
}
