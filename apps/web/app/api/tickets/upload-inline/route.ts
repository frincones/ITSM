import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * POST /api/tickets/upload-inline
 *
 * Body (multipart/form-data):
 *   - file: Blob (image pasted into the rich composer, max 10 MB, image/*)
 *   - ticketId: uuid
 *
 * Returns { url, path } — url is a 7-day signed URL we drop straight into
 * the <img src> of the reply body so Gmail/Outlook can render the image
 * when the email goes out.
 */
export async function POST(req: NextRequest) {
  try {
    const serverClient = getSupabaseServerClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve tenant via agent record — same pattern as tickets.ts.
    const { data: agent } = await serverClient
      .from('agents')
      .select('id, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const ticketId = formData.get('ticketId') as string | null;

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only image/* allowed' }, { status: 400 });
    }

    // Verify ticket belongs to the caller's tenant before we spend upload time.
    const { data: ticket } = await serverClient
      .from('tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${agent.tenant_id}/inline/${ticketId}/${timestamp}_${rand}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await svc.storage
      .from('ticket-attachments')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error('[upload-inline] upload error:', uploadErr.message);
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: signed } = await svc.storage
      .from('ticket-attachments')
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    return NextResponse.json({
      url: signed?.signedUrl ?? null,
      path,
    });
  } catch (err) {
    console.error('[upload-inline] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
