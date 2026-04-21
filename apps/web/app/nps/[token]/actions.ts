'use server';

import { createClient } from '@supabase/supabase-js';

/**
 * Record the customer's NPS response. Token is the only auth — it's
 * single-use-ish: once responded_at is set we lock the row.
 */
export async function submitNpsResponse(params: {
  token: string;
  score: number;
  comment?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (
    typeof params.score !== 'number' ||
    !Number.isInteger(params.score) ||
    params.score < 0 ||
    params.score > 10
  ) {
    return { ok: false, error: 'Calificación inválida (0-10).' };
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: survey } = await svc
    .from('nps_surveys')
    .select('id, responded_at, expires_at')
    .eq('token', params.token)
    .maybeSingle();

  if (!survey) return { ok: false, error: 'Encuesta no encontrada.' };
  if (survey.responded_at) return { ok: false, error: 'Ya respondiste esta encuesta.' };
  if (new Date(survey.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Esta encuesta expiró.' };
  }

  const { error } = await svc
    .from('nps_surveys')
    .update({
      score: params.score,
      comment: params.comment?.trim() || null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', survey.id)
    .is('responded_at', null);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
