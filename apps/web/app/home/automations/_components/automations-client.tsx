'use client';

import { useState } from 'react';

import Link from 'next/link';

import {
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Filter,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  TrendingUp,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kit/ui/tabs';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AutomationWorkflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
  success_rate: number;
  last_run_at: string | null;
  steps_count: number;
}

interface BusinessRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  conditions_count: number;
  actions_count: number;
  is_active: boolean;
  execution_count: number;
}

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  next_run_at: string | null;
  last_run_at: string | null;
  is_active: boolean;
}

interface AutomationsStats {
  activeWorkflows: number;
  executionsToday: number;
  successRate: number;
  avgDuration: number;
}

interface AutomationsClientProps {
  workflows: AutomationWorkflow[];
  rules: BusinessRule[];
  scheduledTasks: ScheduledTask[];
  stats: AutomationsStats;
}

/* -------------------------------------------------------------------------- */
/*  Fallback Data                                                              */
/* -------------------------------------------------------------------------- */

const fallbackWorkflows: AutomationWorkflow[] = [
  {
    id: '1',
    name: 'Critical Ticket Auto-Routing',
    description: 'Automatically route critical priority tickets to the appropriate team',
    trigger_type: 'Ticket Created',
    is_active: true,
    execution_count: 1247,
    success_rate: 98.4,
    last_run_at: '2 min ago',
    steps_count: 4,
  },
  {
    id: '2',
    name: 'SLA Breach Alert',
    description: 'Send notifications when tickets are about to breach SLA',
    trigger_type: 'SLA Warning',
    is_active: true,
    execution_count: 856,
    success_rate: 99.1,
    last_run_at: '15 min ago',
    steps_count: 3,
  },
  {
    id: '3',
    name: 'Auto-Close Resolved Tickets',
    description: 'Automatically close tickets that have been resolved for 24 hours',
    trigger_type: 'Schedule: Daily',
    is_active: true,
    execution_count: 342,
    success_rate: 100,
    last_run_at: '1 hour ago',
    steps_count: 2,
  },
  {
    id: '4',
    name: 'Weekend Emergency Escalation',
    description: 'Escalate high priority tickets created during weekends',
    trigger_type: 'Ticket Created',
    is_active: false,
    execution_count: 89,
    success_rate: 96.6,
    last_run_at: '2 days ago',
    steps_count: 5,
  },
  {
    id: '5',
    name: 'AI-Powered Ticket Classification',
    description: 'Use AI to automatically classify and categorize incoming tickets',
    trigger_type: 'Ticket Created',
    is_active: true,
    execution_count: 3421,
    success_rate: 94.2,
    last_run_at: 'Just now',
    steps_count: 6,
  },
];

const fallbackRules: BusinessRule[] = [
  {
    id: '1',
    name: 'Auto-assign Network Issues to Network Team',
    description: "Automatically assign tickets with category 'Network' to Network Team",
    trigger_type: 'Ticket Created',
    conditions_count: 2,
    actions_count: 2,
    is_active: true,
    execution_count: 567,
  },
  {
    id: '2',
    name: 'Notify Supervisor on High Priority',
    description: 'Send email to supervisor when high priority ticket is created',
    trigger_type: 'Ticket Created',
    conditions_count: 1,
    actions_count: 1,
    is_active: true,
    execution_count: 234,
  },
  {
    id: '3',
    name: 'Set SLA for VIP Customers',
    description: 'Apply priority SLA for tickets from VIP customers',
    trigger_type: 'Ticket Created',
    conditions_count: 1,
    actions_count: 1,
    is_active: true,
    execution_count: 89,
  },
];

const fallbackScheduledTasks: ScheduledTask[] = [
  {
    id: '1',
    name: 'Daily Metrics Snapshot',
    schedule: 'Every day at 23:59',
    next_run_at: 'Today at 23:59',
    last_run_at: 'Yesterday at 23:59',
    is_active: true,
  },
  {
    id: '2',
    name: 'SLA Compliance Check',
    schedule: 'Every 5 minutes',
    next_run_at: 'In 2 minutes',
    last_run_at: '3 minutes ago',
    is_active: true,
  },
  {
    id: '3',
    name: 'Stale Ticket Reminder',
    schedule: 'Every Monday at 09:00',
    next_run_at: 'Monday at 09:00',
    last_run_at: 'Last Monday at 09:00',
    is_active: true,
  },
];

const fallbackStats: AutomationsStats = {
  activeWorkflows: 12,
  executionsToday: 1200,
  successRate: 97.8,
  avgDuration: 1.1,
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatLastRun(value: string | null): string {
  if (!value) return 'Never';
  if (!value.includes('T')) return value;
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AutomationsClient({
  workflows,
  rules,
  scheduledTasks,
  stats,
}: AutomationsClientProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const displayWorkflows =
    workflows.length > 0 ? workflows : fallbackWorkflows;
  const displayRules = rules.length > 0 ? rules : fallbackRules;
  const displayTasks =
    scheduledTasks.length > 0 ? scheduledTasks : fallbackScheduledTasks;
  const displayStats =
    stats.activeWorkflows > 0 ? stats : fallbackStats;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Automations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Workflows, rules, and scheduled tasks to automate your service desk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Zap className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
          <Link href="/home/workflows/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50">
                <Zap className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Workflows</p>
                <p className="text-2xl font-semibold">
                  {displayStats.activeWorkflows}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Executions Today</p>
                <p className="text-2xl font-semibold">
                  {formatNumber(displayStats.executionsToday)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-semibold">
                  {displayStats.successRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Duration</p>
                <p className="text-2xl font-semibold">
                  {displayStats.avgDuration}s
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search automations..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workflows" className="space-y-6">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="rules">Business Rules</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Tasks</TabsTrigger>
        </TabsList>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          {displayWorkflows
            .filter(
              (w) =>
                w.name
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()) ||
                (w.description ?? '')
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()),
            )
            .map((workflow) => (
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
                            <Link
                              href={`/home/workflows/${workflow.id}`}
                            >
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
                              <span>
                                Trigger: {workflow.trigger_type}
                              </span>
                            </div>
                            <span>
                              {workflow.steps_count} steps
                            </span>
                            <span>
                              {workflow.execution_count.toLocaleString()}{' '}
                              executions
                            </span>
                            <span className="text-green-600">
                              {workflow.success_rate}% success
                            </span>
                            <span>
                              Last run:{' '}
                              {formatLastRun(workflow.last_run_at)}
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
                              <Link
                                href={`/home/workflows/${workflow.id}`}
                              >
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
        </TabsContent>

        {/* Business Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {displayRules
            .filter(
              (r) =>
                r.name
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()) ||
                (r.description ?? '')
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()),
            )
            .map((rule) => (
              <Card
                key={rule.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                      <Zap className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">
                              {rule.name}
                            </h3>
                            <Badge className="bg-green-100 text-green-700">
                              {rule.is_active ? 'active' : 'inactive'}
                            </Badge>
                          </div>
                          <p className="mb-3 text-sm text-gray-600">
                            {rule.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Trigger: {rule.trigger_type}</span>
                            <span>
                              {rule.conditions_count} conditions
                            </span>
                            <span>{rule.actions_count} actions</span>
                            <span>
                              {rule.execution_count} executions
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
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
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
        </TabsContent>

        {/* Scheduled Tasks Tab */}
        <TabsContent value="scheduled" className="space-y-4">
          {displayTasks
            .filter((t) =>
              t.name.toLowerCase().includes(searchTerm.toLowerCase()),
            )
            .map((task) => (
              <Card
                key={task.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">
                              {task.name}
                            </h3>
                            <Badge className="bg-green-100 text-green-700">
                              {task.is_active ? 'active' : 'inactive'}
                            </Badge>
                          </div>
                          <p className="mb-3 text-sm text-gray-600">
                            {task.schedule}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>
                              Next run:{' '}
                              {task.next_run_at ?? 'Not scheduled'}
                            </span>
                            <span>
                              Last run:{' '}
                              {formatLastRun(task.last_run_at)}
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
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Schedule
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Play className="mr-2 h-4 w-4" />
                              Run Now
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
