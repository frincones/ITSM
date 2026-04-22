'use client';

import { useEffect, useRef } from 'react';

import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/**
 * Raw `tickets` row shape as broadcast by Supabase Realtime (REPLICA
 * IDENTITY FULL). Includes every column the server stores, so each view
 * can resolve joined fields (assigned_agent, organization, category)
 * from maps it already has as props.
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
  /**
   * Unique channel name per view. Two views rendered at once (e.g. if a
   * dev splits the list) must not share this string — Supabase silently
   * dedupes identical channel names per connection.
   */
  channelKey: string;
  /**
   * Optional server-side filter. See Supabase docs for syntax —
   * e.g. `assigned_agent_id=eq.<uuid>`. Undefined = all UPDATEs for the
   * caller's tenant pass through (RLS handles tenant scoping).
   */
  filter?: string;
  /** INSERT handler. Called once per matching INSERT event. */
  onInsert: (row: RealtimeTicketRow) => void;
  /**
   * UPDATE handler. `newRow` is the post-update snapshot; `oldRow` is the
   * pre-update snapshot (available only because we set
   * REPLICA IDENTITY FULL on the table in migration 00038).
   */
  onUpdate: (
    newRow: RealtimeTicketRow,
    oldRow: Partial<RealtimeTicketRow>,
  ) => void;
}

/**
 * Subscribe to realtime UPSERTS on `tickets`. The hook manages channel
 * lifecycle; each view provides INSERT/UPDATE handlers that mutate its
 * own state. DELETE events are not exposed — tickets are soft-deleted
 * (UPDATE with `deleted_at` set), and Supabase drops the event under
 * RLS because the SELECT policy excludes `deleted_at IS NOT NULL`.
 *
 * Callbacks are captured via refs so a re-rendering parent does not
 * cause the subscription to tear down and re-create on every render.
 */
export function useTicketRealtime(opts: UseTicketRealtimeOptions): void {
  const onInsertRef = useRef(opts.onInsert);
  const onUpdateRef = useRef(opts.onUpdate);
  onInsertRef.current = opts.onInsert;
  onUpdateRef.current = opts.onUpdate;

  const { channelKey, filter } = opts;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tickets',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onInsertRef.current(payload.new as RealtimeTicketRow);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onUpdateRef.current(
            payload.new as RealtimeTicketRow,
            (payload.old ?? {}) as Partial<RealtimeTicketRow>,
          );
        },
      )
      .subscribe();

    return () => {
      // Explicit cleanup — a stale subscription would leak a WebSocket
      // connection and keep firing handlers against unmounted state.
      supabase.removeChannel(channel);
    };
  }, [channelKey, filter]);
}
