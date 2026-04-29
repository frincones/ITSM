import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/portal/upload — Upload file to Supabase Storage                  */
/*                                                                             */
/*  Returns the upload metadata so the caller (reply composer in /home, or     */
/*  the public portal) can drop the signed URL into the message body.          */
/*                                                                             */
/*  When an authenticated agent (with a valid `ticketId` body field) calls     */
/*  this, we ALSO insert a `ticket_attachments` row linked to their tenant.    */
/*  That row is what powers the new download/preview UI in the timeline —      */
/*  it survives signed-URL expiry because we keep `file_path` (the storage     */
/*  key) and re-sign on demand from /api/attachments/[id]. The legacy          */
/*  HTML-embedded approach keeps working unchanged for callers without a       */
/*  ticketId (e.g. the public service portal pre-ticket flow).                 */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const orgId = formData.get('orgId') as string | null;
    const conversationId = formData.get('conversationId') as string | null;
    const ticketId = formData.get('ticketId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'video/mp4', 'video/quicktime',
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    // Generate unique path
    const ext = file.name.split('.').pop() ?? 'bin';
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${orgId ?? 'unknown'}/${conversationId ?? 'uploads'}/${timestamp}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await supabase.storage
      .from('ticket-attachments')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('[Portal Upload] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get public URL (signed for private bucket)
    const { data: urlData } = await supabase.storage
      .from('ticket-attachments')
      .createSignedUrl(data.path, 60 * 60 * 24 * 7); // 7 days

    // Best-effort attachment row insert. We only do this when the caller is
    // an authenticated agent uploading against a real ticket — the public
    // portal flow before a ticket exists wouldn't have a tenant to bind to.
    // RLS handles the tenant check; we do not trust ticketId to belong to
    // the caller until we look it up.
    let attachmentId: string | null = null;
    if (ticketId) {
      try {
        const ssr = getSupabaseServerClient();
        const {
          data: { user },
        } = await ssr.auth.getUser();
        if (user) {
          const { data: agent } = await ssr
            .from('agents')
            .select('id, tenant_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (agent) {
            const { data: ticketRow } = await ssr
              .from('tickets')
              .select('id')
              .eq('id', ticketId)
              .eq('tenant_id', agent.tenant_id)
              .is('deleted_at', null)
              .maybeSingle();
            if (ticketRow) {
              const { data: inserted } = await ssr
                .from('ticket_attachments')
                .insert({
                  tenant_id: agent.tenant_id,
                  ticket_id: ticketId,
                  file_name: file.name,
                  file_path: data.path,
                  mime_type: file.type,
                  file_size: file.size,
                  uploaded_by: user.id,
                })
                .select('id')
                .single();
              attachmentId = (inserted?.id as string | undefined) ?? null;
            }
          }
        }
      } catch (insertErr) {
        // Non-fatal: legacy HTML-embed flow still works. Log and continue.
        console.warn('[Portal Upload] attachment row not created:', insertErr);
      }
    }

    return NextResponse.json({
      path: data.path,
      url: urlData?.signedUrl ?? null,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      attachmentId,
    });
  } catch (err) {
    console.error('[Portal Upload] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
