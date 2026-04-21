'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2 } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@kit/ui/sheet';
import { Separator } from '@kit/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

import {
  assignTicket,
  changeTicketStatus,
  updateTicket,
} from '~/lib/actions/tickets';
import type { TicketStatus, SeverityLevel } from '@kit/ui/itsm';

import type { WorkspaceTicket } from '~/lib/services/workspace-grouping';

interface AgentOption {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
}

interface TicketPreviewPanelProps {
  ticket: WorkspaceTicket;
  agents: AgentOption[];
  organizations: Map<string, string>;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: 'new', label: 'Nuevo' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'assigned', label: 'Asignado' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'detenido', label: 'Detenido' },
  { value: 'testing', label: 'Testing' },
  { value: 'resolved', label: 'Resuelto' },
  { value: 'closed', label: 'Cerrado' },
];

const URGENCY_OPTIONS: Array<{ value: SeverityLevel; label: string }> = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Medio' },
  { value: 'low', label: 'Bajo' },
];

function getClientRank(t: WorkspaceTicket): number | null {
  const raw = (t.custom_fields ?? {})['client_rank'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function TicketPreviewPanel({
  ticket,
  agents,
  organizations,
  onClose,
}: TicketPreviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const orgName = ticket.organization_id
    ? organizations.get(ticket.organization_id) ?? 'Sin cliente'
    : 'Sin cliente';
  const rank = getClientRank(ticket);

  const handleStatusChange = (next: string) => {
    startTransition(async () => {
      const result = await changeTicketStatus(ticket.id, next as TicketStatus);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Estado actualizado');
        router.refresh();
      }
    });
  };

  const handleUrgencyChange = (next: string) => {
    startTransition(async () => {
      const result = await updateTicket(ticket.id, {
        urgency: next as SeverityLevel,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success('Prioridad actualizada');
        router.refresh();
      }
    });
  };

  const handleAssigneeChange = (next: string) => {
    startTransition(async () => {
      const result = await assignTicket(
        ticket.id,
        next === 'unassigned' ? null : next,
      );
      if (result.error) toast.error(result.error);
      else {
        toast.success('Responsable actualizado');
        router.refresh();
      }
    });
  };

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px]">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-mono">
            {ticket.ticket_number}
            {rank !== null && (
              <Badge className="h-5 border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Orden Cliente #{rank}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-base font-semibold text-foreground leading-snug">
            {ticket.title}
          </SheetDescription>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{orgName}</span>
            <span>·</span>
            <span>
              Creado{' '}
              {formatDistanceToNowStrict(new Date(ticket.created_at), {
                locale: es,
                addSuffix: true,
              })}
            </span>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Estado
            </label>
            <Select
              defaultValue={ticket.status}
              onValueChange={handleStatusChange}
              disabled={isPending}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Urgency */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Prioridad
            </label>
            <Select
              defaultValue={ticket.urgency}
              onValueChange={handleUrgencyChange}
              disabled={isPending}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {URGENCY_OPTIONS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Responsable
            </label>
            <Select
              defaultValue={ticket.assigned_agent_id ?? 'unassigned'}
              onValueChange={handleAssigneeChange}
              disabled={isPending}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(a.name)}
                        </AvatarFallback>
                      </Avatar>
                      {a.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Requester */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Solicitante
            </p>
            {ticket.requester ? (
              <div className="flex items-center gap-2 text-sm">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {getInitials(ticket.requester.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{ticket.requester.name}</p>
                  {ticket.requester.email && (
                    <p className="text-xs text-muted-foreground">
                      {ticket.requester.email}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {ticket.requester_email ?? '—'}
              </p>
            )}
          </div>

          {ticket.category && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Categoría
              </p>
              <Badge variant="secondary">{ticket.category.name}</Badge>
            </div>
          )}

          <Separator />

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2">
            {isPending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando…
              </span>
            )}
            <Link
              href={`/home/tickets/${ticket.id}`}
              className="ml-auto"
              onClick={onClose}
            >
              <Button size="sm" className="gap-1.5">
                Abrir detalle completo
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {ticket.closed_at && (
            <p className="text-[11px] text-muted-foreground">
              Cerrado el{' '}
              {format(new Date(ticket.closed_at), "d 'de' MMM yyyy, HH:mm", {
                locale: es,
              })}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
