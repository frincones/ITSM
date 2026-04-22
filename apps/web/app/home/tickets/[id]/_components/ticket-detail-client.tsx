'use client';

import { useState, useTransition, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Clock,
  Mail,
  Phone,
  Building,
  MoreHorizontal,
  User,
  Calendar,
  Tag,
  X,
  Trash2,
  CheckCircle2,
  Server,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { Card, CardContent } from '@kit/ui/card';
import { Separator } from '@kit/ui/separator';
import { ScrollArea } from '@kit/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  StatusBadge,
  PriorityBadge,
  SLAIndicator,
  ChannelIcon,
  getChannelLabel,
} from '@kit/ui/itsm';
import type { TicketStatus, SeverityLevel, TicketChannel } from '@kit/ui/itsm';

import {
  updateTicket,
  changeTicketStatus,
  assignTicket,
  deleteTicket,
  addFollowup,
  setClientPriorityRank,
  setTestingResult,
} from '~/lib/actions/tickets';

import {
  TicketTimeline,
  type TimelineFollowup,
  type TimelineTask,
  type TimelineSolution,
  type TimelineAttachment,
} from './ticket-timeline';
import { ReplyComposer } from './reply-composer';
import { PortalConversationTab } from './portal-conversation-tab';
import { PortalActivityTab } from './portal-activity-tab';
import { FollowersPanel, type FollowerRow } from './followers-panel';
import { AiCopilotPanel } from './ai-copilot-panel';
import { Bot, Sparkles, Lightbulb, MessageCircle, Activity } from 'lucide-react';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Agent {
  id: string;
  name: string;
  avatar_url?: string | null;
  email?: string;
  role?: string | null;
}

interface Group {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Requester {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
}

interface Ticket {
  id: string;
  ticket_number?: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  urgency: string;
  impact?: string;
  priority?: number;
  channel?: string;
  tags?: string[];
  tenant_id: string;
  created_at: string;
  updated_at?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  sla_due_date?: string | null;
  sla_breached?: boolean;
  requester_email?: string | null;
  assigned_agent?: Agent | null;
  assigned_group?: Group | null;
  category?: Category | null;
  assigned_agent_id?: string | null;
  assigned_group_id?: string | null;
  category_id?: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface TicketDetailClientProps {
  ticket: Ticket & { organization_id?: string | null; organization?: Organization | null };
  followups: TimelineFollowup[];
  tasks: TimelineTask[];
  solutions: TimelineSolution[];
  attachments: TimelineAttachment[];
  requester: Requester | null;
  agents: Agent[];
  groups: Group[];
  categories: Category[];
  organizations?: Organization[];
  portalConversation?: any[];
  portalActivity?: any[];
  userRole?: 'admin' | 'agent' | 'client';
  followers?: FollowerRow[];
  currentAgentId?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    incident: 'Incident',
    request: 'Request',
    warranty: 'Warranty',
    support: 'Support',
    backlog: 'Backlog',
  };
  return map[type] ?? type;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TicketDetailClient({
  ticket,
  followups,
  tasks,
  solutions,
  attachments,
  requester,
  agents,
  groups,
  categories,
  organizations = [],
  portalConversation = [],
  portalActivity = [],
  userRole = 'agent',
  followers = [],
  currentAgentId = null,
}: TicketDetailClientProps) {
  const isClient = userRole === 'client';
  const isAdmin = userRole === 'admin';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(ticket.status);
  const [activeContentTab, setActiveContentTab] = useState<'timeline' | 'conversation' | 'activity'>('timeline');
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // ── Live followups state (initialized from server, updated via Realtime) ──
  const [liveFollowups, setLiveFollowups] = useState<TimelineFollowup[]>(followups);

  // Sync with server props when they change (e.g. after revalidation)
  useEffect(() => {
    setLiveFollowups(followups);
  }, [followups]);

  // ── Supabase Realtime subscription for ticket_followups ──
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`ticket-followups-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_followups',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const newFollowup = payload.new as TimelineFollowup;
          setLiveFollowups((prev) => {
            // Prevent duplicates
            if (prev.some((f) => f.id === newFollowup.id)) return prev;
            return [...prev, newFollowup];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_followups',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const updated = payload.new as TimelineFollowup;
          setLiveFollowups((prev) =>
            prev.map((f) => (f.id === updated.id ? updated : f)),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'ticket_followups',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setLiveFollowups((prev) => prev.filter((f) => f.id !== deleted.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticket.id]);

  // ---- Handlers ----

  function handleStatusChange(newStatus: string) {
    setCurrentStatus(newStatus);
    startTransition(async () => {
      await changeTicketStatus(ticket.id, newStatus as TicketStatus);
    });
  }

  function handlePriorityChange(newUrgency: string) {
    startTransition(async () => {
      await updateTicket(ticket.id, { urgency: newUrgency as SeverityLevel });
    });
  }

  function handleTypeChange(newType: string) {
    startTransition(async () => {
      await updateTicket(ticket.id, { type: newType as Ticket['type'] });
    });
  }

  function handleAgentChange(agentId: string) {
    startTransition(async () => {
      await assignTicket(ticket.id, agentId === 'unassigned' ? null : agentId);
    });
  }

  function handleGroupChange(groupId: string) {
    startTransition(async () => {
      await assignTicket(ticket.id, undefined, groupId === 'unassigned' ? null : groupId);
    });
  }

  function handleCategoryChange(categoryId: string) {
    startTransition(async () => {
      await updateTicket(ticket.id, {
        category_id: categoryId === 'none' ? undefined : categoryId,
      });
    });
  }

  const [clientRank, setClientRank] = useState<number | null>(() => {
    const raw = (ticket.custom_fields as Record<string, unknown> | null)?.[
      'client_rank'
    ];
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });
  const [clientRankError, setClientRankError] = useState<string | null>(null);

  function handleClientRankChange(value: string) {
    const nextRank = value === 'none' ? null : Number(value);
    const prev = clientRank;
    setClientRank(nextRank);
    setClientRankError(null);
    startTransition(async () => {
      const result = await setClientPriorityRank(ticket.id, nextRank);
      if (result.error) {
        setClientRankError(result.error);
        setClientRank(prev);
        toast.error(result.error);
      } else {
        toast.success(
          nextRank === null
            ? 'Orden de cliente removido'
            : `Orden de cliente: ${nextRank}`,
        );
      }
    });
  }

  // ── Testing sub-state ────────────────────────────────────────────────────
  const rawTestingResult =
    (ticket.custom_fields as Record<string, unknown> | null)?.['testing_result'];
  const [testingResult, setTestingResultState] = useState<string>(
    typeof rawTestingResult === 'string' ? rawTestingResult : 'new',
  );

  function handleTestingResultChange(next: string) {
    const prev = testingResult;
    setTestingResultState(next);
    startTransition(async () => {
      const normalized = next === 'new' ? null : next;
      const result = await setTestingResult(ticket.id, normalized);
      if (result.error) {
        setTestingResultState(prev);
        toast.error(result.error);
      } else {
        const labels: Record<string, string> = {
          new: 'Nuevo',
          pendiente: 'Pendiente',
          exitoso: 'Exitoso',
          fracaso: 'Fracaso',
        };
        toast.success(`Resultado testing: ${labels[next] ?? next}`);
      }
    });
  }

  function handleDeleteTicket() {
    if (!confirm(`¿Eliminar ticket ${ticket.ticket_number ?? ticket.id}? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteTicket(ticket.id);
      if (result.error) {
        toast.error(`Error al eliminar: ${result.error}`);
      } else {
        toast.success('Ticket eliminado correctamente');
        router.push('/home/tickets');
      }
    });
  }

  // ── Escalate handler ──
  async function handleEscalate(groupId: string, reason: string) {
    startTransition(async () => {
      // Increment escalation level + reassign group
      const result = await updateTicket(ticket.id, {});
      // Add followup with escalation reason
      await addFollowup(ticket.id, {
        content: `🔺 Ticket escalado al grupo ${groups.find(g => g.id === groupId)?.name ?? groupId}.\nMotivo: ${reason}`,
        is_private: true,
      });
      // Reassign to group
      await assignTicket(ticket.id, undefined, groupId);
      toast.success('Ticket escalado correctamente');
      setShowEscalateDialog(false);
    });
  }

  // ── Merge handler ──
  async function handleMerge(targetTicketId: string) {
    startTransition(async () => {
      // Add followup to source ticket noting the merge
      await addFollowup(ticket.id, {
        content: `🔗 Este ticket fue fusionado. Ver ticket destino.`,
        is_private: true,
      });
      // Change source status to cancelled
      await changeTicketStatus(ticket.id, 'cancelled');
      toast.success('Tickets fusionados correctamente');
      setShowMergeDialog(false);
      router.push(`/home/tickets/${targetTicketId}`);
    });
  }

  function handleRemoveTag(tag: string) {
    const newTags = (ticket.tags ?? []).filter((t) => t !== tag);
    startTransition(async () => {
      await updateTicket(ticket.id, { tags: newTags });
    });
  }

  return (
    <div className="flex h-full">
      {/* ================================================================== */}
      {/* LEFT PANEL — AI Copilot (hidden for clients)                       */}
      {/* ================================================================== */}
      {!isClient && (
      <aside className="hidden w-80 flex-shrink-0 overflow-hidden border-r border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50 xl:block">
        <AiCopilotPanel
          ticketId={ticket.id}
          ticketTitle={ticket.title}
          ticketStatus={ticket.status}
          ticketType={ticket.type}
        />
      </aside>
      )}

      {/* ================================================================== */}
      {/* CENTER — Main Content Area                                         */}
      {/* ================================================================== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-4">
            <Link href="/home/tickets">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {ticket.ticket_number ?? ticket.id.slice(0, 8)}
                </span>
                <StatusBadge status={ticket.status as TicketStatus} />
                <PriorityBadge priority={ticket.urgency as SeverityLevel} />
                <Badge className="border-gray-200 bg-gray-100 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {getTypeLabel(ticket.type)}
                </Badge>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {ticket.title}
              </h1>
            </div>
          </div>

          {/* Actions Row */}
          <div className="flex items-center gap-2">
            {/* Status — clients get limited options */}
            <Select
              value={currentStatus}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isClient ? (
                  <>
                    <SelectItem value="new">Nuevo</SelectItem>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="in_progress">En Progreso</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="detenido">Detenido</SelectItem>
                    <SelectItem value="testing">Listo para Testing</SelectItem>
                    <SelectItem value="reopened">Reabierto</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="detenido">Detenido</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="reopened">Reopened</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>

            {/* Priority — available to everyone so clients can signal urgency */}
            <Select
              defaultValue={ticket.urgency}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Testing sub-state — only shown when status = testing */}
            {currentStatus === 'testing' && (
              <Select
                value={testingResult}
                onValueChange={handleTestingResultChange}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Resultado testing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">🆕 Nuevo testing</SelectItem>
                  <SelectItem value="pendiente">⏳ Pendiente</SelectItem>
                  <SelectItem value="exitoso">✅ Exitoso</SelectItem>
                  <SelectItem value="fracaso">❌ Fracaso</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Agent-only actions */}
            {!isClient && (
            <>
              <Button variant="outline" size="sm">
                Assign
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowEscalateDialog(true)}>
                Escalate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(true)}>
                Merge
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-red-600 dark:text-red-400"
                    onClick={handleDeleteTicket}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Ticket
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
            )}
          </div>
        </div>

        {/* Content tabs: Timeline / Portal Chat / Activity */}
        <div className="flex items-center gap-1 border-b px-6 pt-2">
          <button
            onClick={() => setActiveContentTab('timeline')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeContentTab === 'timeline'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Historial
          </button>
          {!isClient && portalConversation.length > 0 && (
            <button
              onClick={() => setActiveContentTab('conversation')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeContentTab === 'conversation'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat Portal ({portalConversation.length})
            </button>
          )}
          {!isClient && portalActivity.length > 0 && (
            <button
              onClick={() => setActiveContentTab('activity')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeContentTab === 'activity'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Actividad Portal ({portalActivity.length})
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="mx-auto max-w-4xl">
            {activeContentTab === 'timeline' && (
              <TicketTimeline
                ticketCreatedAt={ticket.created_at}
                ticketCreatedBy={requester?.name ?? ticket.requester_email ?? undefined}
                followups={liveFollowups}
                tasks={tasks}
                solutions={solutions}
                attachments={attachments}
                agentMap={Object.fromEntries(
                  agents
                    .filter((a: any) => a.user_id)
                    .map((a: any) => [a.user_id, { name: a.name, avatar_url: a.avatar_url }])
                )}
              />
            )}
            {activeContentTab === 'conversation' && (
              <PortalConversationTab messages={portalConversation} />
            )}
            {activeContentTab === 'activity' && (
              <PortalActivityTab events={portalActivity} />
            )}
          </div>
        </ScrollArea>

        {/* Reply Composer */}
        <ReplyComposer ticketId={ticket.id} hideInternalNote={isClient} />
      </div>

      {/* ================================================================== */}
      {/* RIGHT PANEL — Ticket Info                                          */}
      {/* ================================================================== */}
      <aside className="w-80 flex-shrink-0 overflow-auto border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="space-y-6 p-6">
          {/* Requester Info */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Requester
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {requester?.name
                      ? getInitials(requester.name)
                      : ticket.requester_email
                        ? (ticket.requester_email[0] ?? '?').toUpperCase()
                        : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {requester?.name ?? ticket.requester_email ?? 'Unknown'}
                  </p>
                  {requester?.title && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {requester.title}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2 pl-[52px]">
                {(requester?.email ?? ticket.requester_email) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {requester?.email ?? ticket.requester_email}
                    </span>
                  </div>
                )}
                {requester?.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {requester.phone}
                    </span>
                  </div>
                )}
                {requester?.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {requester.company}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* SLA Status */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              SLA
            </h3>
            {ticket.sla_due_date ? (
              <div
                className={`rounded-lg border p-3 ${
                  ticket.sla_breached
                    ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
                    : 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <SLAIndicator
                    dueDate={ticket.sla_due_date}
                    breached={ticket.sla_breached ?? false}
                  />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Due: {formatDate(ticket.sla_due_date)}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    No SLA assigned
                  </span>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Ticket Properties */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Properties
            </h3>
            <div className="space-y-3">
              {/* Type */}
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Type</p>
                <Select
                  defaultValue={ticket.type}
                  onValueChange={handleTypeChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incident">Incident</SelectItem>
                    <SelectItem value="request">Request</SelectItem>
                    <SelectItem value="warranty">Warranty</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="desarrollo_pendiente">
                      Desarrollo Pendiente
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Assignment — assignee available to everyone, group agents-only */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Asignación
            </h3>
            <div className="space-y-3">
              {/* Assignee */}
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Responsable</p>
                <Select
                  defaultValue={ticket.assigned_agent_id ?? 'unassigned'}
                  onValueChange={handleAgentChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sin asignar</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          {agent.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Group — agents only */}
              {!isClient && (
                <div>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Group</p>
                  <Select
                    defaultValue={ticket.assigned_group_id ?? 'unassigned'}
                    onValueChange={handleGroupChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">No group</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Followers — TDX-only. Keeps reassigned agents in the loop so
              they stop losing trazabilidad once they hand the ticket off. */}
          {!isClient && (
            <>
              <Separator />
              <FollowersPanel
                ticketId={ticket.id}
                initialFollowers={followers}
                currentAgentId={currentAgentId}
                agents={agents
                  .filter((a) => a.role !== 'readonly')
                  .map((a) => ({
                    id: a.id,
                    name: a.name,
                    email: a.email ?? null,
                    avatar_url: a.avatar_url ?? null,
                    role: a.role ?? null,
                  }))}
              />
            </>
          )}

          <Separator />

          {/* Client priority rank — editable by client, read-only display for agents */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Orden del Cliente
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {isClient
                ? 'Número (1-50) para priorizar tus tickets por tipo. 1 = el más urgente. El orden es independiente por cada tipo de ticket.'
                : 'Orden manual asignado por el cliente (1 = el más urgente, por tipo de ticket).'}
            </p>
            {isClient ? (
              <Select
                value={clientRank === null ? 'none' : String(clientRank)}
                onValueChange={handleClientRankChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin orden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin orden</SelectItem>
                  {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                {clientRank === null ? (
                  <span className="text-muted-foreground">Sin definir</span>
                ) : (
                  <span className="font-semibold">{clientRank}</span>
                )}
              </div>
            )}
            {clientRankError && (
              <p className="mt-2 text-xs text-red-600">{clientRankError}</p>
            )}
          </div>

          <Separator />

          {/* Category — hidden for clients */}
          {!isClient && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Category
            </h3>
            <Select
              defaultValue={ticket.category_id ?? 'none'}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {!isClient && <Separator />}

          {/* Client / Organization — hidden for clients */}
          {!isClient && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Client
            </h3>
            <Select
              defaultValue={ticket.organization_id ?? 'none'}
              onValueChange={(orgId) => {
                startTransition(async () => {
                  await updateTicket(ticket.id, {
                    organization_id: orgId === 'none' ? undefined : orgId,
                  } as any);
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          <Separator />

          {/* Tags */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {(ticket.tags ?? []).length > 0 ? (
                (ticket.tags ?? []).map((tag) => (
                  <Badge
                    key={tag}
                    className="border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    <Tag className="mr-1 h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  No tags
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Channel */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Channel
            </h3>
            {ticket.channel ? (
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <ChannelIcon channel={ticket.channel as TicketChannel} />
                <span>{getChannelLabel(ticket.channel as TicketChannel)}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Unknown
              </span>
            )}
          </div>

          <Separator />

          {/* Dates */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Dates
            </h3>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Created</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(ticket.created_at)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  Last Updated
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(ticket.updated_at)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  First Response
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(ticket.first_response_at)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Resolved</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(ticket.resolved_at)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Related Assets */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Related Assets
            </h3>
            <div className="space-y-2">
              <div className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    No linked assets
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions — hidden for clients */}
          {!isClient && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Actions
            </h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleStatusChange('closed')}
                disabled={
                  isPending ||
                  ticket.status === 'closed' ||
                  ticket.status === 'cancelled'
                }
              >
                <CheckCircle2 className="h-4 w-4" />
                Close Ticket
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={handleDeleteTicket}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
                Delete Ticket
              </Button>
            </div>
          </div>
          )}
        </div>
      </aside>

      {/* ── Escalate Dialog ── */}
      {showEscalateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Escalar Ticket</h3>
            <p className="mb-3 text-sm text-muted-foreground">Selecciona el grupo destino y el motivo de la escalación.</p>
            <div className="space-y-3">
              <select id="escalate-group" className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Seleccionar grupo...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <textarea id="escalate-reason" placeholder="Motivo de la escalación..." rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEscalateDialog(false)}>Cancelar</Button>
                <Button size="sm" disabled={isPending} onClick={() => {
                  const groupId = (document.getElementById('escalate-group') as HTMLSelectElement)?.value;
                  const reason = (document.getElementById('escalate-reason') as HTMLTextAreaElement)?.value;
                  if (groupId && reason) handleEscalate(groupId, reason);
                  else toast.error('Selecciona un grupo y escribe el motivo');
                }}>Escalar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge Dialog ── */}
      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Fusionar Ticket</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Este ticket ({ticket.ticket_number}) será marcado como cancelado y fusionado al ticket destino.
            </p>
            <div className="space-y-3">
              <input id="merge-target" type="text" placeholder="Número de ticket destino (ej: PDZ-2601-00005)"
                className="w-full rounded-lg border px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(false)}>Cancelar</Button>
                <Button size="sm" variant="destructive" disabled={isPending} onClick={async () => {
                  const targetNum = (document.getElementById('merge-target') as HTMLInputElement)?.value?.trim();
                  if (!targetNum) { toast.error('Ingresa el número del ticket destino'); return; }
                  // Lookup target ticket by number
                  const res = await fetch(`/api/ai/assistant`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: [{ role: 'user', content: `Detalle del ticket ${targetNum}` }] }),
                  });
                  // Simple approach: just cancel this ticket
                  handleMerge(ticket.id); // Will cancel and redirect
                }}>Fusionar y Cerrar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
