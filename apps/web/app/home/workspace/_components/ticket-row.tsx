'use client';

import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowUpCircle,
  ExternalLink,
  UserCircle2,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { cn } from '@kit/ui/utils';

import type { WorkspaceTicket } from '~/lib/services/workspace-grouping';

const STATUS_CLASSES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300',
  backlog:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300',
  assigned:
    'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300',
  in_progress:
    'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300',
  pending:
    'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300',
  detenido:
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300',
  testing:
    'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300',
  resolved:
    'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300',
  closed:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400',
  cancelled:
    'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Nuevo',
  backlog: 'Backlog',
  assigned: 'Asignado',
  in_progress: 'En Progreso',
  pending: 'Pendiente',
  detenido: 'Detenido',
  testing: 'Testing',
  resolved: 'Resuelto',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

const ORG_COLORS = [
  'bg-amber-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-orange-500',
  'bg-teal-500',
];

function orgColor(orgId: string | null): string {
  if (!orgId) return 'bg-muted-foreground';
  let hash = 0;
  for (let i = 0; i < orgId.length; i++) hash = (hash * 31 + orgId.charCodeAt(i)) | 0;
  return ORG_COLORS[Math.abs(hash) % ORG_COLORS.length]!;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function getClientRank(t: WorkspaceTicket): number | null {
  const raw = (t.custom_fields ?? {})['client_rank'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface TicketRowProps {
  ticket: WorkspaceTicket;
  organizations: Map<string, string>;
  currentAgentId: string;
  selected: boolean;
  onSelect: () => void;
}

export function TicketRow({
  ticket,
  organizations,
  currentAgentId,
  selected,
  onSelect,
}: TicketRowProps) {
  const urgencyIcon =
    ticket.urgency === 'critical' ? (
      <AlertCircle className="h-4 w-4 text-destructive" />
    ) : ticket.urgency === 'high' ? (
      <ArrowUpCircle className="h-4 w-4 text-orange-500" />
    ) : (
      <span className="inline-block h-4 w-4" aria-hidden />
    );

  const statusClass = STATUS_CLASSES[ticket.status] ?? STATUS_CLASSES.new;
  const statusLabel = STATUS_LABEL[ticket.status] ?? ticket.status;
  const orgName = ticket.organization_id
    ? organizations.get(ticket.organization_id) ?? '—'
    : '—';
  const rank = getClientRank(ticket);
  const assignee = ticket.assigned_agent;
  const isMine = assignee?.id === currentAgentId;

  const timeAgo = formatDistanceToNowStrict(new Date(ticket.created_at), {
    locale: es,
    addSuffix: false,
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-12 w-full items-center gap-3 px-5 text-left transition-colors',
        'hover:bg-muted/50',
        selected && 'bg-muted',
      )}
    >
      {urgencyIcon}

      <span className="w-[120px] shrink-0 font-mono text-[11px] text-muted-foreground">
        {ticket.ticket_number}
      </span>

      {rank !== null && (
        <Badge className="h-5 shrink-0 border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          #{rank}
        </Badge>
      )}

      <span className="flex-1 truncate text-sm">
        {ticket.title}
      </span>

      <Badge
        variant="outline"
        className={cn('h-6 shrink-0 px-2 text-[10px] font-medium', statusClass)}
      >
        {statusLabel}
      </Badge>

      <div className="flex w-[140px] shrink-0 items-center gap-1.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            orgColor(ticket.organization_id),
          )}
        />
        <span className="truncate text-xs text-muted-foreground">{orgName}</span>
      </div>

      <div className="flex w-[40px] shrink-0 items-center justify-center">
        {assignee ? (
          <Avatar className={cn('h-6 w-6', isMine && 'ring-2 ring-primary')}>
            <AvatarFallback className="text-[10px]">
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <UserCircle2 className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>

      <span className="w-[50px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {timeAgo}
      </span>

      <Link
        href={`/home/tickets/${ticket.id}`}
        onClick={(e) => e.stopPropagation()}
        aria-label="Abrir detalle del ticket"
        className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </button>
  );
}
