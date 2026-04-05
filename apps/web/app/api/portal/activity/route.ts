import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------- */
/*  POST /api/portal/activity — Track portal user activity                     */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { events } = body as {
      events: Array<{
        tenant_id: string;
        organization_id: string;
        session_id: string;
        user_email?: string;
        user_name?: string;
        event_type: string;
        event_data?: Record<string, unknown>;
        page_url?: string;
        conversation_id?: string;
      }>;
    };

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'events array required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const rows = events.map((e) => ({
      tenant_id: e.tenant_id,
      organization_id: e.organization_id,
      session_id: e.session_id,
      user_email: e.user_email || null,
      user_name: e.user_name || null,
      event_type: e.event_type,
      event_data: e.event_data ?? {},
      page_url: e.page_url || null,
      user_agent: userAgent,
      ip_address: ip,
      conversation_id: e.conversation_id || null,
    }));

    const { error } = await supabase
      .from('portal_activity_log')
      .insert(rows);

    if (error) {
      console.error('[Portal Activity] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('[Portal Activity] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
