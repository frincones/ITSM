import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------------------------- */
/*  POST /api/portal/upload — Upload file to Supabase Storage                  */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const orgId = formData.get('orgId') as string | null;
    const conversationId = formData.get('conversationId') as string | null;

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

    return NextResponse.json({
      path: data.path,
      url: urlData?.signedUrl ?? null,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
  } catch (err) {
    console.error('[Portal Upload] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
