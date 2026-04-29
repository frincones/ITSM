'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Loader2,
  AlertTriangle,
  Clock,
  ListChecks,
  Link2,
  Users,
} from 'lucide-react';
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
  setTestingResult,
  updateTicket,
} from '~/lib/actions/tickets';
import {
  getTicketPreviewData,
  type TicketPreviewData,
} from '~/lib/actions/ticket-preview';
import type { TicketStatus, SeverityLevel } from '@kit/ui/itsm';

import type { WorkspaceTicket } from '~/lib/services/workspace-grouping';

import { TicketPreviewTimeline } from './ticket-preview-timeline';
import { TicketPreviewComposer } from './ticket-preview-composer';

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

interface SlaSnapshot {
  label: string;
  tone: 'breached' | 'soon' | 'ok';
}

function getSlaSnapshot(
  due: string | null,
  breached: boolean,
): SlaSnapshot | null {
  if (!due) return null;
  const dueMs = new Date(due).getTime();
  if (Number.isNaN(dueMs)) return null;
  const diffMs = dueMs - Date.now();

  if (breached || diffMs < 0) {
    return {
      label: `SLA vencido ${formatDistanceToNowStrict(new Date(due), {
        locale: es,
        addSuffix: false,
      })}`,
      tone: 'breached',
    };
  }
  if (diffMs < 4 * 60 * 60 * 1000) {
    return {
      label: `SLA en ${formatDistanceToNowStrict(new Date(due), {
        locale: es,
      })}`,
      tone: 'soon',
    };
  }
  return {
    label: `SLA en ${formatDistanceToNowStrict(new Date(due), {
      locale: es,
    })}`,
    tone: 'ok',
  };
}

const SLA_TONE_CLASSES: Record<SlaSnapshot['tone'], string> = {
  breached:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300',
  soon: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
};

export function TicketPreviewPanel({
  ticket,
  agents,
  organizations,
  onClose,
}: TicketPreviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [previewData, setPreviewData] = useState<TicketPreviewData | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const orgName =
    (ticket.organization_id && organizations.get(ticket.organization_id)) ||
    'Sin cliente';
  const rank = getClientRank(ticket);
  const currentTestingResult =
    ((ticket.custom_fields ?? {})['testing_result'] as string | undefined) ??
    'new';

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    const result = await getTicketPreviewData(ticket.id);
    if (result.error) {
      setPreviewError(result.error);
      setPreviewData(null);
    } else {
      setPreviewData(result.data);
    }
    setPreviewLoading(false);
  }, [ticket.id]);

  // Lazy fetch the preview data (followups + counts + sla) only when the
  // panel actually opens. Re-fetches when the user switches between
  // tickets without closing the sheet.
  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleStatusChange = (next: string) => {
    startTransition(async () => {
      const result = await changeTicketStatus(
        ticket.id,
        next as TicketStatus,
      );
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
        toast.success('Asignación actualizada');
        router.refresh();
      }
    });
  };

  const handleTestingResultChange = (next: string) => {
    startTransition(async () => {
      const result = await setTestingResult(
        ticket.id,
        next === 'new' ? null : next,
      );
      if (result.error) toast.error(result.error);
      else {
        toast.success('Resultado testing actualizado');
        router.refresh();
      }
    });
  };

  const sla = getSlaSnapshot(
    previewData?.sla_due_date ?? null,
    previewData?.sla_breached ?? false,
  );
  const noFirstResponse =
    previewData && !previewData.first_response_at && !previewData.is_client;
  const hideInternalNote = previewData?.is_client ?? false;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]"
      >
        {/* Header — fixed at top */}
        <SheetHeader className="border-b px-6 pb-4 pt-6">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-sm font-mono">
            {ticket.ticket_number}
            {rank !== null && (
              <Badge className="h-5 border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Orden Cliente #{rank}
              </Badge>
            )}
            {sla && (
              <Badge
                variant="outline"
                className={`h-5 gap-1 px-1.5 text-[10px] ${SLA_TONE_CLASSES[sla.tone]}`}
              >
                {sla.tone === 'breached' ? (
                  <AlertTriangle className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
                )}
                {sla.label}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-base font-semibold leading-snug text-foreground">
            {ticket.title}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{orgName}</span>
            <span>·</span>
            <span>
              Creado{' '}
              {formatDistanceToNowStrict(new Date(ticket.created_at), {
                locale: es,
                addSuffix: true,
              })}
            </span>
            {previewData && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {previewData.followers_count} siguiendo
                </span>
              </>
            )}
          </div>
          {noFirstResponse && (
            <div className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Sin primera respuesta aún
            </div>
          )}
        </SheetHeader>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            {/* Quick edit fields (Status / Urgency / Assignee) — same as before */}
            <div className="grid grid-cols-2 gap-3">
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
            </div>

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

            {ticket.status === 'testing' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Resultado Testing
                </label>
                <Select
                  value={currentTestingResult}
                  onValueChange={handleTestingResultChange}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">🆕 Nuevo testing</SelectItem>
                    <SelectItem value="pendiente">⏳ Pendiente</SelectItem>
                    <SelectItem value="exitoso">✅ Exitoso</SelectItem>
                    <SelectItem value="fracaso">❌ Fracaso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Requester + meta */}
            <Separator />

            <div className="grid grid-cols-2 gap-4">
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
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {ticket.requester.name}
                      </p>
                      {ticket.requester.email && (
                        <p className="truncate text-xs text-muted-foreground">
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

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Resumen
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ticket.category && (
                    <Badge variant="secondary" className="text-[10px]">
                      {ticket.category.name}
                    </Badge>
                  )}
                  {previewData && previewData.open_tasks_count > 0 && (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] text-muted-foreground"
                    >
                      <ListChecks className="h-3 w-3" />
                      {previewData.open_tasks_count} tareas
                    </Badge>
                  )}
                  {previewData && previewData.relations_count > 0 && (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] text-muted-foreground"
                    >
                      <Link2 className="h-3 w-3" />
                      {previewData.relations_count} relacionados
                    </Badge>
                  )}
                  {previewData &&
                    previewData.open_tasks_count === 0 &&
                    previewData.relations_count === 0 &&
                    !ticket.category && (
                      <span className="text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Historial reciente
                </p>
                {previewData && (
                  <span className="text-[10px] text-muted-foreground">
                    {previewData.total_followups_count} mensajes
                  </span>
                )}
              </div>

              {previewLoading && !previewData && (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Cargando historial…
                </div>
              )}

              {previewError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {previewError}
                </div>
              )}

              {previewData && (
                <TicketPreviewTimeline
                  followups={previewData.followups}
                  totalCount={previewData.total_followups_count}
                  ticketId={ticket.id}
                />
              )}
            </div>

            {/* Composer */}
            {previewData && (
              <>
                <Separator />
                <TicketPreviewComposer
                  ticketId={ticket.id}
                  hideInternalNote={hideInternalNote}
                  onSent={() => {
                    void loadPreview();
                    router.refresh();
                  }}
                />
              </>
            )}

            {ticket.closed_at && (
              <p className="text-[11px] text-muted-foreground">
                Cerrado el{' '}
                {format(
                  new Date(ticket.closed_at),
                  "d 'de' MMM yyyy, HH:mm",
                  { locale: es },
                )}
              </p>
            )}
          </div>
        </div>

        {/* Footer — fixed at bottom */}
        <div className="flex items-center justify-between gap-2 border-t bg-background px-6 py-3">
          {isPending ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </span>
          ) : (
            <span />
          )}
          <Link
            href={`/home/tickets/${ticket.id}`}
            onClick={onClose}
          >
            <Button size="sm" className="gap-1.5">
              Abrir detalle completo
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
