import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clock, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const org = await resolveOrgByPortalToken(token);
  return { title: `Mis Tickets | ${org?.name ?? 'NovaDesk'}` };
}

export default async function PortalTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ email?: string; status?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const org = await resolveOrgByPortalToken(token);
  if (!org) notFound();

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const email = query.email ?? '';

  let tickets: any[] = [];
  if (email) {
    const q = svc
      .from('tickets')
      .select('id, ticket_number, title, status, type, urgency, created_at, updated_at')
      .eq('tenant_id', org.tenant_id)
      .eq('organization_id', org.id)
      .eq('requester_email', email)
      .order('created_at', { ascending: false })
      .limit(50);

    if (query.status && query.status !== 'all') {
      q.eq('status', query.status);
    }

    const { data } = await q;
    tickets = data ?? [];
  }

  const statusColor: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    assigned: 'bg-cyan-100 text-cyan-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/portal/${token}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
        </Link>
        <h1 className="text-lg font-semibold">Mis Tickets</h1>
      </div>

      {!email ? (
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <p className="mb-2 text-sm text-gray-600">Para ver tus tickets, necesitamos tu email.</p>
            <form className="mx-auto flex max-w-sm gap-2" method="get">
              <input
                name="email"
                type="email"
                placeholder="tu@email.com"
                required
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <Button type="submit" size="sm">Ver tickets</Button>
            </form>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500">No tienes tickets abiertos con {email}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => (
            <Link key={t.id} href={`/portal/${token}/tickets/${t.id}?email=${email}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">{t.ticket_number}</span>
                        <Badge variant="secondary" className={`text-[10px] ${statusColor[t.status] ?? 'bg-gray-100'}`}>
                          {t.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                      </div>
                      <p className="text-sm font-medium">{t.title}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(t.created_at).toLocaleDateString('es')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
