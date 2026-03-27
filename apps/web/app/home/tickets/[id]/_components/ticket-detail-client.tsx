'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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
} from '~/lib/actions/tickets';

import {
  TicketTimeline,
  type TimelineFollowup,
  type TimelineTask,
  type TimelineSolution,
  type TimelineAttachment,
} from './ticket-timeline';
import { ReplyComposer } from './reply-composer';
import { Bot, Sparkles, Lightbulb } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Agent {
  id: string;
  name: string;
  avatar_url?: string | null;
  email?: string;
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
}: TicketDetailClientProps) {
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(ticket.status);

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

  function handleDeleteTicket() {
    if (!confirm('Are you sure you want to delete this ticket?')) return;
    startTransition(async () => {
      await deleteTicket(ticket.id);
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
      {/* LEFT PANEL — AI Assistant                                          */}
      {/* ================================================================== */}
      <aside className="hidden w-80 flex-shrink-0 overflow-hidden border-r border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50 xl:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              <h3 className="font-medium">AI Assistant</h3>
            </div>
          </div>
          <div className="flex-1 space-y-4 p-4">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  Classification
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="secondary">{ticket.type}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Urgency:</span>
                    <Badge variant="secondary">{ticket.urgency}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Suggestions
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  AI suggestions will appear here once the knowledge base is populated.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>

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
            <Select
              value={currentStatus}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

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

            <Button variant="outline" size="sm">
              Assign
            </Button>
            <Button variant="outline" size="sm">
              Escalate
            </Button>
            <Button variant="outline" size="sm">
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
          </div>
        </div>

        {/* Timeline */}
        <ScrollArea className="flex-1 p-6">
          <div className="mx-auto max-w-4xl">
            <TicketTimeline
              ticketCreatedAt={ticket.created_at}
              ticketCreatedBy={requester?.name ?? ticket.requester_email ?? undefined}
              followups={followups}
              tasks={tasks}
              solutions={solutions}
              attachments={attachments}
              agentMap={Object.fromEntries(
                agents
                  .filter((a: any) => a.user_id)
                  .map((a: any) => [a.user_id, { name: a.name, avatar_url: a.avatar_url }])
              )}
            />
          </div>
        </ScrollArea>

        {/* Reply Composer */}
        <ReplyComposer ticketId={ticket.id} />
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
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Assignment */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Assignment
            </h3>
            <div className="space-y-3">
              {/* Assignee */}
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Assignee</p>
                <Select
                  defaultValue={ticket.assigned_agent_id ?? 'unassigned'}
                  onValueChange={handleAgentChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
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

              {/* Group */}
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
            </div>
          </div>

          <Separator />

          {/* Category */}
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

          <Separator />

          {/* Client / Organization */}
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

          {/* Actions */}
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
        </div>
      </aside>
    </div>
  );
}
