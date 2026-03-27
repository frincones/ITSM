import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createTicketSchema,
  ticketTypeEnum,
  ticketStatusEnum,
  severityLevelEnum,
} from '~/lib/schemas/ticket.schema';

// ---------------------------------------------------------------------------
// Auth helper — API key based
// ---------------------------------------------------------------------------

/**
 * Validates the X-API-Key header and resolves the tenant.
 *
 * API keys are stored in the `api_keys` table with `tenant_id` and
 * `is_active` columns.
 */
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
// GET /api/v1/tickets
// ---------------------------------------------------------------------------

/**
 * Lists tickets for the authenticated tenant with pagination and filtering.
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 20, max: 100)
 *   - status (comma-separated)
 *   - type (comma-separated)
 *   - urgency
 *   - assigned_agent_id
 *   - assigned_group_id
 *   - search (title/description fulltext)
 *   - sort_by (default: created_at)
 *   - sort_dir (asc|desc, default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { tenant_id, error: authError } = await authenticateApiKey(request, client);

    if (authError || !tenant_id) {
      return NextResponse.json(
        { error: authError ?? 'Unauthorized' },
        { status: 401 },
      );
    }

    const params = request.nextUrl.searchParams;

    // Parse pagination
    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    // Sort
    const sortBy = params.get('sort_by') ?? 'created_at';
    const sortDir = params.get('sort_dir') === 'asc' ? true : false;

    // Build query
    let query = client
      .from('tickets')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortDir })
      .range(offset, offset + limit - 1);

    // Apply filters
    const statusFilter = params.get('status');
    if (statusFilter) {
      const statuses = statusFilter.split(',').filter((s) => {
        try { ticketStatusEnum.parse(s); return true; } catch { return false; }
      });
      if (statuses.length > 0) {
        query = query.in('status', statuses);
      }
    }

    const typeFilter = params.get('type');
    if (typeFilter) {
      const types = typeFilter.split(',').filter((t) => {
        try { ticketTypeEnum.parse(t); return true; } catch { return false; }
      });
      if (types.length > 0) {
        query = query.in('type', types);
      }
    }

    const urgencyFilter = params.get('urgency');
    if (urgencyFilter) {
      try {
        severityLevelEnum.parse(urgencyFilter);
        query = query.eq('urgency', urgencyFilter);
      } catch {
        // Ignore invalid urgency filter
      }
    }

    const agentFilter = params.get('assigned_agent_id');
    if (agentFilter) {
      query = query.eq('assigned_agent_id', agentFilter);
    }

    const groupFilter = params.get('assigned_group_id');
    if (groupFilter) {
      query = query.eq('assigned_group_id', groupFilter);
    }

    const searchFilter = params.get('search');
    if (searchFilter && searchFilter.trim().length > 0) {
      query = query.or(
        `title.ilike.%${searchFilter.trim()}%,description.ilike.%${searchFilter.trim()}%`,
      );
    }

    const { data: tickets, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: tickets,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error('[api/v1/tickets] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/tickets
// ---------------------------------------------------------------------------

/**
 * Creates a new ticket via the REST API.
 *
 * Request body follows the createTicketSchema.
 */
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { tenant_id, error: authError } = await authenticateApiKey(request, client);

    if (authError || !tenant_id) {
      return NextResponse.json(
        { error: authError ?? 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const validated = createTicketSchema.parse(body);

    const { data: ticket, error } = await client
      .from('tickets')
      .insert({
        ...validated,
        tenant_id, // NEVER from request body
        status: 'new',
        source: 'api',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.errors },
        { status: 422 },
      );
    }
    console.error('[api/v1/tickets] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
