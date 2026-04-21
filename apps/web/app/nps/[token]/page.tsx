import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

import { NpsSurveyForm } from './nps-form';

export const dynamic = 'force-dynamic';

export default async function NpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ score?: string }>;
}) {
  const { token } = await params;
  const { score: prefillScore } = await searchParams;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: survey } = await svc
    .from('nps_surveys')
    .select('id, token, score, comment, responded_at, expires_at, ticket:tickets(ticket_number, title)')
    .eq('token', token)
    .maybeSingle();

  if (!survey) notFound();

  const expired = new Date(survey.expires_at).getTime() < Date.now();
  const alreadyResponded = !!survey.responded_at;
  // Supabase typed join may return array shape — normalize to first row.
  const ticketRaw = survey.ticket as unknown as
    | { ticket_number: string; title: string | null }
    | Array<{ ticket_number: string; title: string | null }>
    | null;
  const ticket = Array.isArray(ticketRaw) ? ticketRaw[0] ?? null : ticketRaw;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-8">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm dark:bg-slate-900">
        <div className="mb-6">
          <div className="mb-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            NovaDesk ITSM
          </div>
          <h1 className="text-2xl font-bold">¿Cómo estuvo tu atención?</h1>
          {ticket && (
            <p className="mt-1 text-sm text-gray-500">
              Ticket <span className="font-mono">{ticket.ticket_number}</span>
              {ticket.title ? ` · ${ticket.title}` : ''}
            </p>
          )}
        </div>

        {alreadyResponded ? (
          <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <p className="font-semibold">¡Gracias por tu respuesta!</p>
            <p className="mt-1 text-sm">
              Calificación registrada: {survey.score}/10
            </p>
          </div>
        ) : expired ? (
          <div className="rounded-lg bg-amber-50 p-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <p className="font-semibold">Esta encuesta ya expiró.</p>
            <p className="mt-1 text-sm">
              Si quieres darnos feedback, contáctanos directamente.
            </p>
          </div>
        ) : (
          <NpsSurveyForm
            token={token}
            initialScore={
              prefillScore !== undefined && !Number.isNaN(Number(prefillScore))
                ? Math.max(0, Math.min(10, Number(prefillScore)))
                : null
            }
          />
        )}
      </div>
    </main>
  );
}
