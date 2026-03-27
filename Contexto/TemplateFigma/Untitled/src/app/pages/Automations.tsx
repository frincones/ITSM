import { useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  Search,
  Filter,
  Play,
  Pause,
  Edit,
  Copy,
  Trash2,
  MoreVertical,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Bot,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const workflows = [
  {
    id: 1,
    name: "Critical Ticket Auto-Routing",
    description: "Automatically route critical priority tickets to the appropriate team",
    trigger: "Ticket Created",
    status: "active",
    executions: 1247,
    success_rate: 98.4,
    last_run: "2 min ago",
    steps: 4,
  },
  {
    id: 2,
    name: "SLA Breach Alert",
    description: "Send notifications when tickets are about to breach SLA",
    trigger: "SLA Warning",
    status: "active",
    executions: 856,
    success_rate: 99.1,
    last_run: "15 min ago",
    steps: 3,
  },
  {
    id: 3,
    name: "Auto-Close Resolved Tickets",
    description: "Automatically close tickets that have been resolved for 24 hours",
    trigger: "Schedule: Daily",
    status: "active",
    executions: 342,
    success_rate: 100,
    last_run: "1 hour ago",
    steps: 2,
  },
  {
    id: 4,
    name: "Weekend Emergency Escalation",
    description: "Escalate high priority tickets created during weekends",
    trigger: "Ticket Created",
    status: "paused",
    executions: 89,
    success_rate: 96.6,
    last_run: "2 days ago",
    steps: 5,
  },
  {
    id: 5,
    name: "AI-Powered Ticket Classification",
    description: "Use AI to automatically classify and categorize incoming tickets",
    trigger: "Ticket Created",
    status: "active",
    executions: 3421,
    success_rate: 94.2,
    last_run: "Just now",
    steps: 6,
  },
];

const rules = [
  {
    id: 1,
    name: "Auto-assign Network Issues to Network Team",
    description: "Automatically assign tickets with category 'Network' to Network Team",
    trigger: "Ticket Created",
    conditions: 2,
    actions: 2,
    status: "active",
    executions: 567,
  },
  {
    id: 2,
    name: "Notify Supervisor on High Priority",
    description: "Send email to supervisor when high priority ticket is created",
    trigger: "Ticket Created",
    conditions: 1,
    actions: 1,
    status: "active",
    executions: 234,
  },
  {
    id: 3,
    name: "Set SLA for VIP Customers",
    description: "Apply priority SLA for tickets from VIP customers",
    trigger: "Ticket Created",
    conditions: 1,
    actions: 1,
    status: "active",
    executions: 89,
  },
];

const scheduledTasks = [
  {
    id: 1,
    name: "Daily Metrics Snapshot",
    schedule: "Every day at 23:59",
    next_run: "Today at 23:59",
    last_run: "Yesterday at 23:59",
    status: "active",
  },
  {
    id: 2,
    name: "SLA Compliance Check",
    schedule: "Every 5 minutes",
    next_run: "In 2 minutes",
    last_run: "3 minutes ago",
    status: "active",
  },
  {
    id: 3,
    name: "Stale Ticket Reminder",
    schedule: "Every Monday at 09:00",
    next_run: "Monday at 09:00",
    last_run: "Last Monday at 09:00",
    status: "active",
  },
];

export function Automations() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Workflows, rules, and scheduled tasks to automate your service desk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Zap className="w-4 h-4 mr-2" />
            Create Rule
          </Button>
          <Link to="/automations/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Workflows</p>
                <p className="text-2xl font-semibold">12</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Executions Today</p>
                <p className="text-2xl font-semibold">1.2K</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-semibold">97.8%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Duration</p>
                <p className="text-2xl font-semibold">1.1s</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search automations..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
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
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      workflow.status === "active"
                        ? "bg-green-50"
                        : "bg-gray-50"
                    }`}
                  >
                    <Zap
                      className={`w-6 h-6 ${
                        workflow.status === "active"
                          ? "text-green-600"
                          : "text-gray-400"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Link to={`/automations/${workflow.id}`}>
                            <h3 className="text-base font-semibold text-gray-900 hover:text-indigo-600">
                              {workflow.name}
                            </h3>
                          </Link>
                          <Badge
                            className={`${
                              workflow.status === "active"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {workflow.status}
                          </Badge>
                          {workflow.name.includes("AI") && (
                            <Badge className="bg-purple-100 text-purple-700">
                              <Bot className="w-3 h-3 mr-1" />
                              AI
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {workflow.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            <span>Trigger: {workflow.trigger}</span>
                          </div>
                          <span>•</span>
                          <span>{workflow.steps} steps</span>
                          <span>•</span>
                          <span>{workflow.executions.toLocaleString()} executions</span>
                          <span>•</span>
                          <span className="text-green-600">
                            {workflow.success_rate}% success
                          </span>
                          <span>•</span>
                          <span>Last run: {workflow.last_run}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            {workflow.status === "active" ? (
                              <>
                                <Pause className="w-4 h-4 mr-2" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
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
          {rules.map((rule) => (
            <Card key={rule.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-gray-900">
                            {rule.name}
                          </h3>
                          <Badge className="bg-green-100 text-green-700">
                            {rule.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {rule.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Trigger: {rule.trigger}</span>
                          <span>•</span>
                          <span>{rule.conditions} conditions</span>
                          <span>•</span>
                          <span>{rule.actions} actions</span>
                          <span>•</span>
                          <span>{rule.executions} executions</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
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
          {scheduledTasks.map((task) => (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-gray-900">
                            {task.name}
                          </h3>
                          <Badge className="bg-green-100 text-green-700">
                            {task.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {task.schedule}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Next run: {task.next_run}</span>
                          <span>•</span>
                          <span>Last run: {task.last_run}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Schedule
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Play className="w-4 h-4 mr-2" />
                            Run Now
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
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