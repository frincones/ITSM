import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clock, MessageSquare, Paperclip } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

export default async function PortalTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { token, id } = await params;
  const query = await searchParams;
  const org = await resolveOrgByPortalToken(token);
  if (!org) notFound();

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: ticket } = await svc
    .from('tickets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', org.tenant_id)
    .single();

  // Verify access: email must match requester_email (if provided)
  const accessEmail = query.email ?? '';
  if (ticket && accessEmail && ticket.requester_email && ticket.requester_email !== accessEmail) {
    notFound(); // Don't show tickets belonging to other users
  }

  if (!ticket) notFound();

  // Fetch followups
  const { data: followups } = await svc
    .from('ticket_followups')
    .select('id, content, is_private, created_at, author_type')
    .eq('ticket_id', id)
    .eq('is_private', false)
    .order('created_at', { ascending: true });

  // Fetch attachments
  const { data: attachments } = await svc
    .from('ticket_attachments')
    .select('id, file_name, file_url, file_type, created_at')
    .eq('ticket_id', id);

  const statusColor: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700', assigned: 'bg-cyan-100 text-cyan-700',
    in_progress: 'bg-yellow-100 text-yellow-700', pending: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-600',
  };

  const urgencyColor: Record<string, string> = {
    low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/portal/${token}/tickets${query.email ? `?email=${query.email}` : ''}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
        </Link>
      </div>

      {/* Ticket header */}
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{ticket.ticket_number}</span>
            <Badge className={statusColor[ticket.status] ?? ''}>{ticket.status}</Badge>
            <Badge variant="outline">{ticket.type}</Badge>
            <Badge className={urgencyColor[ticket.urgency] ?? ''}>{ticket.urgency}</Badge>
          </div>
          <h1 className="mb-2 text-lg font-semibold">{ticket.title}</h1>
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
            {ticket.description}
          </p>
          <div className="mt-4 flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            Creado: {new Date(ticket.created_at).toLocaleString('es')}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Paperclip className="h-4 w-4" /> Adjuntos ({attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attachments.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 rounded border px-3 py-2 text-xs">
                <Paperclip className="h-3 w-3 text-gray-400" />
                <span>{a.file_name}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Followups */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4" /> Historial ({followups?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!followups || followups.length === 0) ? (
            <p className="text-center text-sm text-gray-400">Sin actualizaciones aun</p>
          ) : (
            followups.map((f: any) => (
              <div key={f.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {f.author_type === 'agent' ? 'Soporte' : 'Usuario'}
                  </Badge>
                  <span className="text-[10px] text-gray-400">
                    {new Date(f.created_at).toLocaleString('es')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{f.content}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
