'use client';

import { useState } from 'react';

import Link from 'next/link';

import {
  Bot,
  Copy,
  Edit,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Input } from '@kit/ui/input';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
  success_rate: number;
  last_run_at: string | null;
  steps_count: number;
  created_at: string;
}

interface WorkflowsListClientProps {
  workflows: WorkflowListItem[];
}

/* -------------------------------------------------------------------------- */
/*  Fallback Data                                                              */
/* -------------------------------------------------------------------------- */

const fallbackWorkflows: WorkflowListItem[] = [
  {
    id: '1',
    name: 'Critical Ticket Auto-Routing',
    description:
      'Automatically route critical priority tickets to the appropriate team',
    trigger_type: 'Ticket Created',
    is_active: true,
    execution_count: 1247,
    success_rate: 98.4,
    last_run_at: '2 min ago',
    steps_count: 4,
    created_at: '',
  },
  {
    id: '2',
    name: 'SLA Breach Alert',
    description:
      'Send notifications when tickets are about to breach SLA',
    trigger_type: 'SLA Warning',
    is_active: true,
    execution_count: 856,
    success_rate: 99.1,
    last_run_at: '15 min ago',
    steps_count: 3,
    created_at: '',
  },
  {
    id: '3',
    name: 'Auto-Close Resolved Tickets',
    description:
      'Automatically close tickets that have been resolved for 24 hours',
    trigger_type: 'Schedule: Daily',
    is_active: true,
    execution_count: 342,
    success_rate: 100,
    last_run_at: '1 hour ago',
    steps_count: 2,
    created_at: '',
  },
  {
    id: '4',
    name: 'Weekend Emergency Escalation',
    description:
      'Escalate high priority tickets created during weekends',
    trigger_type: 'Ticket Created',
    is_active: false,
    execution_count: 89,
    success_rate: 96.6,
    last_run_at: '2 days ago',
    steps_count: 5,
    created_at: '',
  },
  {
    id: '5',
    name: 'AI-Powered Ticket Classification',
    description:
      'Use AI to automatically classify and categorize incoming tickets',
    trigger_type: 'Ticket Created',
    is_active: true,
    execution_count: 3421,
    success_rate: 94.2,
    last_run_at: 'Just now',
    steps_count: 6,
    created_at: '',
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatLastRun(lastRun: string | null): string {
  if (!lastRun) return 'Never';
  // If it's a relative string already, return as-is (fallback data)
  if (!lastRun.includes('T')) return lastRun;
  const diffMs = Date.now() - new Date(lastRun).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WorkflowsListClient({
  workflows,
}: WorkflowsListClientProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const displayWorkflows =
    workflows.length > 0 ? workflows : fallbackWorkflows;

  const filtered = displayWorkflows.filter(
    (w) =>
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.description ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Automate your service desk processes
          </p>
        </div>
        <Link href="/home/workflows/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search workflows..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Workflow Cards */}
      <div className="space-y-4">
        {filtered.map((workflow) => (
          <Card
            key={workflow.id}
            className="transition-shadow hover:shadow-md"
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                    workflow.is_active ? 'bg-green-50' : 'bg-gray-50'
                  }`}
                >
                  <Zap
                    className={`h-6 w-6 ${
                      workflow.is_active
                        ? 'text-green-600'
                        : 'text-gray-400'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Link href={`/home/workflows/${workflow.id}`}>
                          <h3 className="text-base font-semibold text-gray-900 hover:text-indigo-600">
                            {workflow.name}
                          </h3>
                        </Link>
                        <Badge
                          className={`${
                            workflow.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {workflow.is_active ? 'active' : 'paused'}
                        </Badge>
                        {workflow.name.includes('AI') && (
                          <Badge className="bg-purple-100 text-purple-700">
                            <Bot className="mr-1 h-3 w-3" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <p className="mb-3 text-sm text-gray-600">
                        {workflow.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          <span>Trigger: {workflow.trigger_type}</span>
                        </div>
                        <span>
                          {workflow.steps_count} steps
                        </span>
                        <span>
                          {workflow.execution_count.toLocaleString()} executions
                        </span>
                        <span className="text-green-600">
                          {workflow.success_rate}% success
                        </span>
                        <span>
                          Last run: {formatLastRun(workflow.last_run_at)}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/home/workflows/${workflow.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          {workflow.is_active ? (
                            <>
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <Zap className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">No workflows found.</p>
        </div>
      )}
    </div>
  );
}
