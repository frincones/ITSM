'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  AlertTriangle,
  TrendingUp,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

interface ProblemAgent {
  name: string;
  avatar_url: string | null;
}

interface ProblemCategory {
  name: string;
}

export interface ProblemRow {
  id: string;
  problem_number: string;
  title: string;
  status: string;
  urgency: string;
  impact: string;
  priority: number;
  root_cause: string | null;
  workaround: string | null;
  created_at: string;
  assigned_agent: ProblemAgent | null;
  category: ProblemCategory | null;
  related_incidents: number;
}

interface ProblemStats {
  activeProblems: number;
  knownErrors: number;
  resolvedThisMonth: number;
  relatedIncidents: number;
}

interface ProblemsClientProps {
  problems: ProblemRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  searchQuery: string;
  stats: ProblemStats;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    accepted: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    analysis: 'bg-purple-100 text-purple-700 border-purple-200',
    root_cause_identified: 'bg-orange-100 text-orange-700 border-orange-200',
    solution_planned: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    resolved: 'bg-green-100 text-green-700 border-green-200',
    closed: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
};

const formatStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: 'New',
    accepted: 'Accepted',
    analysis: 'Root Cause Analysis',
    root_cause_identified: 'Known Error',
    solution_planned: 'Solution Planned',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return labels[status] || status;
};

const getImpactColor = (impact: string) => {
  const colors: Record<string, string> = {
    critical: 'text-red-600',
    high: 'text-red-600',
    medium: 'text-orange-600',
    low: 'text-green-600',
  };
  return colors[impact] || 'text-gray-600';
};

const formatImpactLabel = (impact: string) => {
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[impact] || impact;
};

const getPriorityLabel = (priority: number) => {
  if (priority <= 1) return 'Critical';
  if (priority <= 2) return 'High';
  if (priority <= 3) return 'Medium';
  return 'Low';
};

const getPriorityColor = (priority: number) => {
  if (priority <= 1) return 'bg-red-100 text-red-700 border-red-200';
  if (priority <= 2) return 'bg-orange-100 text-orange-700 border-orange-200';
  if (priority <= 3) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-green-100 text-green-700 border-green-200';
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

export function ProblemsClient({
  problems,
  totalCount,
  currentPage,
  pageSize,
  searchQuery,
  stats,
}: ProblemsClientProps) {
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
      return `/home/problems?${params.toString()}`;
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
            Problem Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Identify and resolve root causes of recurring incidents
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Problems</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.activeProblems}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Known Errors</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.knownErrors}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                  <AlertTriangle className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Resolved This Month</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.resolvedThisMonth}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Related Incidents</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {stats.relatedIncidents}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
                  <Users className="h-6 w-6 text-purple-600" />
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
              placeholder="Search problems by ID, title, or category..."
              className="border-gray-200 bg-gray-50 pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={handleSearch}
            />
          </div>
          <Button className="ml-4 gap-2">
            <Plus className="h-4 w-4" />
            Create Problem
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <Card className="border-0 shadow-none">
          <Table>
            <TableHeader className="sticky top-0 border-b border-gray-200 bg-gray-50">
              <TableRow>
                <TableHead>Problem ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Related Incidents</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-gray-500"
                  >
                    No problems found.
                  </TableCell>
                </TableRow>
              ) : (
                problems.map((problem) => (
                  <TableRow
                    key={problem.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      router.push(`/home/problems/${problem.id}`)
                    }
                  >
                    <TableCell>
                      <span className="text-sm font-medium text-indigo-600">
                        {problem.problem_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        <p className="line-clamp-2 text-sm font-medium text-gray-900">
                          {problem.title}
                        </p>
                        {problem.category && (
                          <p className="mt-1 text-xs text-gray-500">
                            {problem.category.name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getStatusColor(problem.status)}`}
                      >
                        {formatStatusLabel(problem.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getPriorityColor(problem.priority)}`}
                      >
                        {getPriorityLabel(problem.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${getImpactColor(problem.impact)}`}
                      >
                        {formatImpactLabel(problem.impact)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {problem.assigned_agent ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {problem.assigned_agent.avatar_url ? (
                              <AvatarImage
                                src={problem.assigned_agent.avatar_url}
                                alt={problem.assigned_agent.name}
                              />
                            ) : null}
                            <AvatarFallback className="text-xs">
                              {getInitials(problem.assigned_agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-gray-900">
                            {problem.assigned_agent.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {problem.related_incidents}
                        </span>
                        <span className="text-xs text-gray-500">incidents</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">
                        {formatDistanceToNow(
                          new Date(problem.created_at),
                          { addSuffix: true },
                        )}
                      </span>
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
            Showing {rangeStart} to {rangeEnd} of {totalCount} problems
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
