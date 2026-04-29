import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * GET /api/attachments/[id]?disposition=inline|attachment
 *
 * Resolves a `ticket_attachments` row (RLS-scoped to the caller's tenant),
 * mints a fresh short-lived signed URL for the underlying object, and 302s
 * the browser to it.
 *
 * Why an API route and not a Server Action:
 *   The browser needs a single GET it can put in `<a href>` / `<img src>`.
 *   Server Actions are POST-only and don't return redirects natively.
 *
 * Why we re-sign on every request:
 *   The bucket is private. Signed URLs are ephemeral by design (we use 5
 *   minutes here, plenty for the redirect to complete). Persisting the URL
 *   anywhere would just create stale-link bugs once it expires.
 */
const SIGNED_URL_TTL_SECONDS = 300; // 5 min

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // UUID guard — Supabase will throw on bad input, but cheap to short-circuit.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid attachment id' }, { status: 400 });
  }

  const disposition =
    req.nextUrl.searchParams.get('disposition') === 'attachment'
      ? 'attachment'
      : 'inline';

  try {
    const client = getSupabaseServerClient();

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS filters by tenant via get_current_tenant_id(). If the user doesn't
    // belong to the attachment's tenant, the row simply isn't visible.
    const { data: attachment, error } = await client
      .from('ticket_attachments')
      .select('id, file_name, file_path, mime_type')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!attachment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const filePath = (attachment as { file_path: string | null }).file_path;
    if (!filePath) {
      // Legacy row from before migration 00040 — we never persisted the
      // storage key, so we can't re-sign. The original signed URL (if still
      // valid) is in `file_url`, but that's outside this endpoint's scope.
      return NextResponse.json(
        { error: 'Attachment has no stored path (legacy row)' },
        { status: 410 },
      );
    }

    const fileName = (attachment as { file_name: string | null }).file_name ?? 'file';

    const { data: signed, error: signErr } = await client.storage
      .from('ticket-attachments')
      .createSignedUrl(
        filePath,
        SIGNED_URL_TTL_SECONDS,
        disposition === 'attachment' ? { download: fileName } : undefined,
      );

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message ?? 'Could not sign URL' },
        { status: 500 },
      );
    }

    // 302 keeps the URL out of any cached HTML and tells the browser this
    // is a one-shot redirect — exactly what `<a href>` / `<img>` need.
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error('[attachments/[id]] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
