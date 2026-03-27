'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Filter,
  Download,
  MoreVertical,
  Search as SearchIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Mail,
  MessageSquare,
  Globe,
  Phone,
  Bot,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Checkbox } from '@kit/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { TicketFilters } from './ticket-filters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketAgent {
  name: string;
  avatar_url: string | null;
}

interface TicketRequester {
  name: string;
  email: string;
}

interface TicketCategory {
  name: string;
}

export interface TicketRow {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  type: string;
  urgency: string;
  priority: string;
  channel: string;
  sla_due_date: string | null;
  sla_breached: boolean;
  created_at: string;
  organization_id: string | null;
  assigned_agent: TicketAgent | null;
  requester: TicketRequester | null;
  category: TicketCategory | null;
}

interface Filters {
  status: string;
  type: string;
  priority: string;
  category: string;
  agent: string;
  from: string;
  to: string;
}

interface TicketListClientProps {
  tickets: TicketRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  currentAgentId: string | null;
  organizationMap?: Record<string, string>;
  activeTab: string;
  searchQuery: string;
  filters: Filters;
}

// ---------------------------------------------------------------------------
// Color helpers (match template exactly)
// ---------------------------------------------------------------------------

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };
  return colors[priority] || 'bg-gray-100 text-gray-700';
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    assigned: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    in_progress: 'bg-purple-100 text-purple-700 border-purple-200',
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    testing: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    resolved: 'bg-green-100 text-green-700 border-green-200',
    closed: 'bg-gray-100 text-gray-700 border-gray-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
};

const formatStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: 'New',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    pending: 'Pending',
    testing: 'Testing',
    resolved: 'Resolved',
    closed: 'Closed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
};

const formatPriorityLabel = (priority: string) => {
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[priority] || priority;
};

const formatTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    incident: 'Incident',
    service_request: 'Service Request',
    question: 'Question',
    problem: 'Problem',
    change: 'Change',
  };
  return labels[type] || type;
};

const getTypeBadgeColor = (type: string) => {
  const colors: Record<string, string> = {
    incident: 'bg-red-50 text-red-600 border-red-200',
    service_request: 'bg-blue-50 text-blue-600 border-blue-200',
    question: 'bg-purple-50 text-purple-600 border-purple-200',
    problem: 'bg-orange-50 text-orange-600 border-orange-200',
    change: 'bg-teal-50 text-teal-600 border-teal-200',
  };
  return colors[type] || 'bg-gray-50 text-gray-600 border-gray-200';
};

// ---------------------------------------------------------------------------
// SLA Indicator
// ---------------------------------------------------------------------------

function SLAIndicator({
  slaDueDate,
  slaBreached,
  status,
}: {
  slaDueDate: string | null;
  slaBreached: boolean;
  status: string;
}) {
  if (status === 'resolved' || status === 'closed') {
    return <span className="text-sm text-gray-400">Resolved</span>;
  }

  if (!slaDueDate) {
    return <span className="text-sm text-gray-400">--</span>;
  }

  if (slaBreached) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" />
        Breached
      </span>
    );
  }

  const now = new Date();
  const due = new Date(slaDueDate);
  const diffMs = due.getTime() - now.getTime();

  if (diffMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" />
        Overdue
      </span>
    );
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const remainMinutes = diffMinutes % 60;

  let label: string;

  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    const remainHours = diffHours % 24;
    label = `${days}d ${remainHours}h`;
  } else if (diffHours > 0) {
    label = `${diffHours}h ${remainMinutes}m`;
  } else {
    label = `${diffMinutes}m`;
  }

  // Risk if less than 1 hour
  const isRisk = diffMs < 3600000;

  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium ${
        isRisk ? 'text-orange-600' : 'text-gray-600'
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Channel Icon
// ---------------------------------------------------------------------------

function ChannelIcon({ channel }: { channel: string }) {
  const iconClass = 'h-3.5 w-3.5 text-gray-400';

  switch (channel) {
    case 'email':
      return <Mail className={iconClass} />;
    case 'chat':
      return <MessageSquare className={iconClass} />;
    case 'portal':
      return <Globe className={iconClass} />;
    case 'phone':
      return <Phone className={iconClass} />;
    case 'api':
      return <Bot className={iconClass} />;
    default:
      return <Globe className={iconClass} />;
  }
}

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TicketListClient({
  tickets,
  totalCount,
  currentPage,
  pageSize,
  currentAgentId,
  organizationMap = {},
  activeTab,
  searchQuery,
  filters,
}: TicketListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [search, setSearch] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);

  // Filter tickets client-side for "mine" tab (needs currentAgentId comparison)
  const displayTickets =
    activeTab === 'mine'
      ? tickets.filter((t) => t.assigned_agent !== null)
      : tickets;

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(overrides).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      return `/home/tickets?${params.toString()}`;
    },
    [searchParams],
  );

  const navigateTo = useCallback(
    (overrides: Record<string, string | undefined>) => {
      startTransition(() => {
        router.push(buildUrl(overrides));
      });
    },
    [router, buildUrl],
  );

  // ---------------------------------------------------------------------------
  // Tab change
  // ---------------------------------------------------------------------------

  const handleTabChange = (tab: string) => {
    navigateTo({ tab: tab === 'all' ? undefined : tab, page: undefined });
  };

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  const handleSearch = () => {
    navigateTo({ search: search || undefined, page: undefined });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const toggleTicket = (id: string) => {
    setSelectedTickets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    setSelectedTickets((prev) =>
      prev.length === displayTickets.length
        ? []
        : displayTickets.map((t) => t.id),
    );
  };

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  const totalPages = Math.ceil(totalCount / pageSize);
  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalCount);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tickets</h1>
            <p className="mt-1 text-sm text-gray-500">
              {totalCount} total tickets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <Filter className="h-4 w-4" />
              Advanced Filters
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Link href="/home/tickets/new">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Ticket
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">All Tickets</TabsTrigger>
            <TabsTrigger value="mine">Assigned to Me</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <TicketFilters
          filters={filters}
          onApply={(newFilters) => {
            navigateTo({
              ...newFilters,
              page: undefined,
            });
            setShowFilters(false);
          }}
          onClear={() => {
            navigateTo({
              status: undefined,
              type: undefined,
              priority: undefined,
              category: undefined,
              agent: undefined,
              from: undefined,
              to: undefined,
              page: undefined,
            });
            setShowFilters(false);
          }}
        />
      )}

      {/* Search and Bulk Actions */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search tickets by ID, subject, requester..."
              className="border-gray-200 bg-gray-50 pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={handleSearch}
            />
          </div>
          {selectedTickets.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedTickets.length} selected
              </span>
              <Button variant="outline" size="sm">
                Assign
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Change Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>New</DropdownMenuItem>
                  <DropdownMenuItem>Assigned</DropdownMenuItem>
                  <DropdownMenuItem>In Progress</DropdownMenuItem>
                  <DropdownMenuItem>Pending</DropdownMenuItem>
                  <DropdownMenuItem>Resolved</DropdownMenuItem>
                  <DropdownMenuItem>Closed</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm">
                Bulk Actions
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <Table>
          <TableHeader className="sticky top-0 border-b border-gray-200 bg-gray-50">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    displayTickets.length > 0 &&
                    selectedTickets.length === displayTickets.length
                  }
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Ticket #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayTickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="py-12 text-center text-gray-500"
                >
                  No tickets found.
                </TableCell>
              </TableRow>
            ) : (
              displayTickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/home/tickets/${ticket.id}`)}
                >
                  {/* Checkbox */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedTickets.includes(ticket.id)}
                      onCheckedChange={() => toggleTicket(ticket.id)}
                    />
                  </TableCell>

                  {/* Ticket # */}
                  <TableCell>
                    <Link
                      href={`/home/tickets/${ticket.id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ChannelIcon channel={ticket.channel} />
                      {ticket.ticket_number}
                    </Link>
                  </TableCell>

                  {/* Title */}
                  <TableCell>
                    <Link
                      href={`/home/tickets/${ticket.id}`}
                      className="block max-w-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="line-clamp-1 text-sm text-gray-900">
                        {ticket.title}
                      </span>
                    </Link>
                  </TableCell>

                  {/* Type Badge */}
                  <TableCell>
                    <Badge
                      className={`text-xs border ${getTypeBadgeColor(ticket.type)}`}
                    >
                      {formatTypeLabel(ticket.type)}
                    </Badge>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    <Badge
                      className={`text-xs border ${getStatusColor(ticket.status)}`}
                    >
                      {formatStatusLabel(ticket.status)}
                    </Badge>
                  </TableCell>

                  {/* Priority Badge */}
                  <TableCell>
                    <Badge
                      className={`text-xs border ${getPriorityColor(ticket.priority)}`}
                    >
                      {formatPriorityLabel(ticket.priority)}
                    </Badge>
                  </TableCell>

                  {/* Client (Organization) */}
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {ticket.organization_id
                        ? organizationMap[ticket.organization_id] ?? '--'
                        : '--'}
                    </span>
                  </TableCell>

                  {/* Requester */}
                  <TableCell>
                    {ticket.requester ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(ticket.requester.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-900">
                          {ticket.requester.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">--</span>
                    )}
                  </TableCell>

                  {/* Assignee */}
                  <TableCell>
                    {ticket.assigned_agent ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {ticket.assigned_agent.avatar_url ? (
                            <AvatarImage
                              src={ticket.assigned_agent.avatar_url}
                              alt={ticket.assigned_agent.name}
                            />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {getInitials(ticket.assigned_agent.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-900">
                          {ticket.assigned_agent.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Unassigned</span>
                    )}
                  </TableCell>

                  {/* SLA */}
                  <TableCell>
                    <SLAIndicator
                      slaDueDate={ticket.sla_due_date}
                      slaBreached={ticket.sla_breached}
                      status={ticket.status}
                    />
                  </TableCell>

                  {/* Created (relative time) */}
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDistanceToNow(new Date(ticket.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </TableCell>

                  {/* Actions Menu */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/home/tickets/${ticket.id}`}>View</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>Assign</DropdownMenuItem>
                        <DropdownMenuItem>Change Priority</DropdownMenuItem>
                        <DropdownMenuItem>Merge</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
          <p className="text-sm text-gray-600">
            Showing {rangeStart} to {rangeEnd} of {totalCount} tickets
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() =>
                navigateTo({ page: String(currentPage - 1) })
              }
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() =>
                navigateTo({ page: String(currentPage + 1) })
              }
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
