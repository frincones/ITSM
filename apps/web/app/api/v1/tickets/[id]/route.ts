import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { updateTicketSchema } from '~/lib/schemas/ticket.schema';

// ---------------------------------------------------------------------------
// Auth helper — API key based
// ---------------------------------------------------------------------------

async function authenticateApiKey(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseServerClient>,
) {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey) {
    return { tenant_id: null, error: 'Missing X-API-Key header' } as const;
  }

  const { data: keyRecord, error } = await client
    .from('api_keys')
    .select('id, tenant_id, is_active, scopes')
    .eq('key_hash', apiKey)
    .eq('is_active', true)
    .single();

  if (error || !keyRecord) {
    return { tenant_id: null, error: 'Invalid or inactive API key' } as const;
  }

  // Update last_used_at
  await client
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id);

  return { tenant_id: keyRecord.tenant_id as string, error: null } as const;
}

// ---------------------------------------------------------------------------
// GET /api/v1/tickets/[id]
// ---------------------------------------------------------------------------

/**
 * Fetches a single ticket by ID with its related data (followups, tasks,
 * solutions).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = getSupabaseServerClient();
    const { tenant_id, error: authError } = await authenticateApiKey(request, client);

    if (authError || !tenant_id) {
      return NextResponse.json(
        { error: authError ?? 'Unauthorized' },
        { status: 401 },
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID format' },
        { status: 400 },
      );
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .select(
        '*, ticket_followups(*), ticket_tasks(*), ticket_solutions(*)',
      )
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: ticket });
  } catch (err) {
    console.error('[api/v1/tickets/[id]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/tickets/[id]
// ---------------------------------------------------------------------------

/**
 * Updates a ticket by ID. Accepts partial updates matching updateTicketSchema.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = getSupabaseServerClient();
    const { tenant_id, error: authError } = await authenticateApiKey(request, client);

    if (authError || !tenant_id) {
      return NextResponse.json(
        { error: authError ?? 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const validated = updateTicketSchema.parse(body);

    // Verify ticket exists and belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id, status')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    // Apply status transition validation if status is being changed
    if (validated.status && validated.status !== existing.status) {
      const VALID_TRANSITIONS: Record<string, string[]> = {
        new: ['assigned', 'in_progress', 'cancelled'],
        assigned: ['in_progress', 'pending', 'cancelled'],
        in_progress: ['pending', 'testing', 'resolved', 'cancelled'],
        pending: ['in_progress', 'resolved', 'cancelled'],
        testing: ['in_progress', 'resolved', 'cancelled'],
        resolved: ['closed', 'in_progress'],
        closed: [],
        cancelled: [],
      };

      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(validated.status)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from '${existing.status}' to '${validated.status}'`,
          },
          { status: 422 },
        );
      }
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      ...validated,
      updated_at: now,
    };

    // Record timestamps for status changes
    if (validated.status === 'resolved') {
      updatePayload.resolved_at = now;
    }
    if (validated.status === 'closed') {
      updatePayload.closed_at = now;
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: ticket });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.errors },
        { status: 422 },
      );
    }
    console.error('[api/v1/tickets/[id]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/tickets/[id]
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a ticket by setting `deleted_at`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const client = getSupabaseServerClient();
    const { tenant_id, error: authError } = await authenticateApiKey(request, client);

    if (authError || !tenant_id) {
      return NextResponse.json(
        { error: authError ?? 'Unauthorized' },
        { status: 401 },
      );
    }

    // Verify ticket exists and belongs to tenant
    const { data: existing } = await client
      .from('tickets')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    const { error } = await client
      .from('tickets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenant_id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { data: { id, deleted: true } },
      { status: 200 },
    );
  } catch (err) {
    console.error('[api/v1/tickets/[id]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
