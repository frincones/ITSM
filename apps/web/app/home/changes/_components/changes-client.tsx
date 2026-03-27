'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  GitBranch,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangeAgent {
  name: string;
  avatar_url: string | null;
}

interface ChangeCategory {
  name: string;
}

export interface ChangeRow {
  id: string;
  change_number: string;
  title: string;
  status: string;
  change_type: string;
  risk_level: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  approval_status: string | null;
  created_at: string;
  assigned_agent: ChangeAgent | null;
  category: ChangeCategory | null;
}

interface ChangeStats {
  pendingApproval: number;
  scheduled: number;
  implementing: number;
  completedThisMonth: number;
}

interface ChangesClientProps {
  changes: ChangeRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  searchQuery: string;
  stats: ChangeStats;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    evaluation: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    approval_pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    in_progress: 'bg-orange-100 text-orange-700 border-orange-200',
    testing: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    implemented: 'bg-green-100 text-green-700 border-green-200',
    rolled_back: 'bg-red-100 text-red-700 border-red-200',
    closed: 'bg-gray-100 text-gray-700 border-gray-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
};

const formatStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: 'New',
    evaluation: 'Evaluation',
    approval_pending: 'Pending Approval',
    approved: 'Approved',
    scheduled: 'Scheduled',
    in_progress: 'Implementing',
    testing: 'Testing',
    implemented: 'Implemented',
    rolled_back: 'Rolled Back',
    closed: 'Closed',
    rejected: 'Rejected',
  };
  return labels[status] || status;
};

const getChangeTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    standard: 'bg-blue-50 text-blue-600 border-blue-200',
    normal: 'bg-gray-100 text-gray-700 border-gray-200',
    emergency: 'bg-red-50 text-red-600 border-red-200',
  };
  return colors[type] || 'bg-gray-100 text-gray-700';
};

const formatChangeTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    standard: 'Standard',
    normal: 'Normal',
    emergency: 'Emergency',
  };
  return labels[type] || type;
};

const getRiskColor = (risk: string) => {
  const colors: Record<string, string> = {
    critical: 'text-red-600',
    high: 'text-red-600',
    medium: 'text-orange-600',
    low: 'text-green-600',
  };
  return colors[risk] || 'text-gray-600';
};

const formatRiskLabel = (risk: string) => {
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[risk] || risk;
};

const getApprovalColor = (status: string | null) => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  };
  return colors[status ?? ''] || 'bg-gray-100 text-gray-700';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChangesClient({
  changes,
  totalCount,
  currentPage,
  pageSize,
  searchQuery,
  stats,
}: ChangesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchQuery);

  // Navigation helpers
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
      return `/home/changes?${params.toString()}`;
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

  const handleSearch = () => {
    navigateTo({ search: search || undefined, page: undefined });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Pagination
  const totalPages = Math.ceil(totalCount / pageSize);
  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            Change Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Plan, approve, and track IT infrastructure changes
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending Approval</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.pendingApproval}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-50">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Scheduled</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.scheduled}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                  <GitBranch className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Implementing</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.implementing}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                  <AlertCircle className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    Completed This Month
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.completedThisMonth}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search changes by ID, title, or implementer..."
              className="border-gray-200 bg-gray-50 pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={handleSearch}
            />
          </div>
          <Button className="ml-4 gap-2">
            <Plus className="h-4 w-4" />
            Request Change
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <Card className="border-0 shadow-none">
          <Table>
            <TableHeader className="sticky top-0 border-b border-gray-200 bg-gray-50">
              <TableRow>
                <TableHead>Change ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-gray-500"
                  >
                    No changes found.
                  </TableCell>
                </TableRow>
              ) : (
                changes.map((change) => (
                  <TableRow
                    key={change.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      router.push(`/home/changes/${change.id}`)
                    }
                  >
                    <TableCell>
                      <span className="text-sm font-medium text-indigo-600">
                        {change.change_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        <p className="line-clamp-2 text-sm font-medium text-gray-900">
                          {change.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            className={`text-xs border ${getChangeTypeColor(change.change_type)}`}
                          >
                            {formatChangeTypeLabel(change.change_type)}
                          </Badge>
                          {change.category && (
                            <span className="text-xs text-gray-500">
                              {change.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getStatusColor(change.status)}`}
                      >
                        {formatStatusLabel(change.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getChangeTypeColor(change.change_type)}`}
                      >
                        {formatChangeTypeLabel(change.change_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${getRiskColor(change.risk_level)}`}
                      >
                        {formatRiskLabel(change.risk_level)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {change.assigned_agent ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {change.assigned_agent.avatar_url ? (
                              <AvatarImage
                                src={change.assigned_agent.avatar_url}
                                alt={change.assigned_agent.name}
                              />
                            ) : null}
                            <AvatarFallback className="text-xs">
                              {getInitials(change.assigned_agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-gray-900">
                            {change.assigned_agent.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {change.scheduled_start ? (
                        <span className="whitespace-nowrap text-sm text-gray-900">
                          {format(
                            new Date(change.scheduled_start),
                            'MMM d, yyyy h:mm a',
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">
                          Not scheduled
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getApprovalColor(change.approval_status)}`}
                      >
                        {change.approval_status
                          ? change.approval_status.charAt(0).toUpperCase() +
                            change.approval_status.slice(1)
                          : 'Pending'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
          <p className="text-sm text-gray-600">
            Showing {rangeStart} to {rangeEnd} of {totalCount} changes
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
