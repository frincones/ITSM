import { useState } from "react";
import { useParams, Link } from "react-router";
import {
  ArrowLeft,
  Plus,
  Play,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Copy,
  Zap,
  Clock,
  GitBranch,
  Bot,
  User,
  Mail,
  Webhook,
  CheckCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

const workflowSteps = [
  {
    id: 1,
    type: "trigger",
    name: "Ticket Created",
    config: { event: "ticket.created" },
    position: { x: 100, y: 100 },
  },
  {
    id: 2,
    type: "condition",
    name: "Priority = Critical?",
    config: { field: "priority", operator: "equals", value: "critical" },
    position: { x: 100, y: 220 },
  },
  {
    id: 3,
    type: "action",
    name: "Assign to Network Team",
    config: { action: "assign_group", group_id: "network-team" },
    position: { x: 100, y: 340 },
  },
  {
    id: 4,
    type: "action",
    name: "Send Email Notification",
    config: { action: "send_email", template: "critical_alert" },
    position: { x: 100, y: 460 },
  },
];

const availableBlocks = [
  {
    category: "Triggers",
    items: [
      { type: "trigger", icon: Zap, label: "Ticket Created", color: "text-indigo-600 bg-indigo-50" },
      { type: "trigger", icon: Zap, label: "Ticket Updated", color: "text-indigo-600 bg-indigo-50" },
      { type: "trigger", icon: Clock, label: "Schedule", color: "text-blue-600 bg-blue-50" },
      { type: "trigger", icon: Mail, label: "Email Received", color: "text-green-600 bg-green-50" },
    ],
  },
  {
    category: "Conditions",
    items: [
      { type: "condition", icon: GitBranch, label: "If/Else", color: "text-orange-600 bg-orange-50" },
      { type: "condition", icon: Bot, label: "AI Decision", color: "text-purple-600 bg-purple-50" },
    ],
  },
  {
    category: "Actions",
    items: [
      { type: "action", icon: User, label: "Assign Agent", color: "text-gray-600 bg-gray-50" },
      { type: "action", icon: Mail, label: "Send Email", color: "text-green-600 bg-green-50" },
      { type: "action", icon: Webhook, label: "Call Webhook", color: "text-red-600 bg-red-50" },
      { type: "action", icon: Clock, label: "Wait/Delay", color: "text-yellow-600 bg-yellow-50" },
    ],
  },
];

const executions = [
  {
    id: 1,
    workflow: "Critical Ticket Auto-Routing",
    trigger: "Ticket #TKT-1247 created",
    status: "completed",
    duration: "1.2s",
    timestamp: "2 min ago",
    steps_executed: 4,
  },
  {
    id: 2,
    workflow: "SLA Breach Alert",
    trigger: "Ticket #TKT-1245 SLA warning",
    status: "completed",
    duration: "0.8s",
    timestamp: "15 min ago",
    steps_executed: 3,
  },
  {
    id: 3,
    workflow: "Auto-Close Resolved Tickets",
    trigger: "Schedule: Every 24h",
    status: "running",
    duration: "—",
    timestamp: "Just now",
    steps_executed: 2,
  },
];

export function WorkflowBuilder() {
  const { id } = useParams();
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/automations">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Critical Ticket Auto-Routing
              </h1>
              <p className="text-sm text-gray-500">
                Automatically route critical priority tickets to the appropriate team
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              Active
            </Badge>
            <Button variant="outline" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </Button>
            <Button variant="outline" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Test Run
            </Button>
            <Button variant="default" size="sm">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Available Blocks */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Building Blocks</h3>
            <div className="space-y-4">
              {availableBlocks.map((category) => (
                <div key={category.category}>
                  <h4 className="text-xs font-medium text-gray-500 mb-2">
                    {category.category}
                  </h4>
                  <div className="space-y-2">
                    {category.items.map((block, idx) => (
                      <div
                        key={idx}
                        className={`${block.color} border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-sm transition-shadow`}
                        draggable
                      >
                        <div className="flex items-center gap-2">
                          <block.icon className="w-4 h-4" />
                          <span className="text-xs font-medium">{block.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 bg-gray-100 overflow-auto">
          <div className="p-8">
            <div className="relative" style={{ minHeight: "800px" }}>
              {/* Grid Background */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                    linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px",
                }}
              />

              {/* Workflow Steps */}
              {workflowSteps.map((step, idx) => {
                const isSelected = selectedStep === step.id;
                const Icon =
                  step.type === "trigger"
                    ? Zap
                    : step.type === "condition"
                    ? GitBranch
                    : User;

                return (
                  <div key={step.id}>
                    {/* Connector Line */}
                    {idx > 0 && (
                      <div
                        className="absolute w-0.5 bg-gray-300"
                        style={{
                          left: step.position.x + 150,
                          top: step.position.y - 20,
                          height: "20px",
                        }}
                      />
                    )}

                    {/* Step Block */}
                    <div
                      className={`absolute bg-white border-2 rounded-lg shadow-sm p-4 cursor-pointer transition-all ${
                        isSelected
                          ? "border-indigo-500 shadow-lg"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                      style={{
                        left: step.position.x,
                        top: step.position.y,
                        width: "300px",
                      }}
                      onClick={() => setSelectedStep(step.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            step.type === "trigger"
                              ? "bg-indigo-50 text-indigo-600"
                              : step.type === "condition"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-gray-50 text-gray-600"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <Badge
                              className={`text-xs ${
                                step.type === "trigger"
                                  ? "bg-indigo-100 text-indigo-700"
                                  : step.type === "condition"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {step.type}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-medium text-gray-900 mb-2">
                            {step.name}
                          </h4>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {JSON.stringify(step.config)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add Step Button */}
              <div
                className="absolute"
                style={{
                  left: 100,
                  top: workflowSteps[workflowSteps.length - 1].position.y + 120,
                }}
              >
                <Button variant="outline" className="border-dashed">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
          {selectedStep ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Step Properties</h3>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Step Name
                  </label>
                  <Input
                    defaultValue={
                      workflowSteps.find((s) => s.id === selectedStep)?.name
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Step Type
                  </label>
                  <Select
                    defaultValue={
                      workflowSteps.find((s) => s.id === selectedStep)?.type
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trigger">Trigger</SelectItem>
                      <SelectItem value="condition">Condition</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                      <SelectItem value="delay">Delay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Configuration
                  </label>
                  <Card>
                    <CardContent className="p-3">
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                        {JSON.stringify(
                          workflowSteps.find((s) => s.id === selectedStep)?.config,
                          null,
                          2
                        )}
                      </pre>
                    </CardContent>
                  </Card>
                </div>

                <Button className="w-full">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Advanced Settings
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-lg mx-auto mb-3 flex items-center justify-center">
                <SettingsIcon className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">
                Select a step to view and edit its properties
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel - Executions Log */}
      <div className="h-64 border-t border-gray-200 bg-white overflow-y-auto">
        <Tabs defaultValue="executions" className="h-full flex flex-col">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="executions">Recent Executions</TabsTrigger>
              <TabsTrigger value="logs">Debug Logs</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="executions" className="flex-1 overflow-y-auto px-6">
            <div className="space-y-2 pb-4">
              {executions.map((execution) => (
                <div
                  key={execution.id}
                  className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:border-gray-300 cursor-pointer"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      execution.status === "completed"
                        ? "bg-green-500"
                        : execution.status === "running"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-red-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {execution.trigger}
                      </span>
                      <Badge
                        className={`text-xs ${
                          execution.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : execution.status === "running"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {execution.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{execution.steps_executed} steps</span>
                      <span>•</span>
                      <span>{execution.duration}</span>
                      <span>•</span>
                      <span>{execution.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="flex-1 overflow-y-auto px-6">
            <div className="pb-4">
              <pre className="text-xs text-gray-600 bg-gray-50 p-4 rounded-lg">
                {`[2026-03-27 10:47:23] Workflow triggered: ticket.created
[2026-03-27 10:47:23] Step 1: Ticket Created - PASSED
[2026-03-27 10:47:24] Step 2: Priority = Critical? - TRUE
[2026-03-27 10:47:24] Step 3: Assign to Network Team - EXECUTED
[2026-03-27 10:47:24] Step 4: Send Email Notification - EXECUTED
[2026-03-27 10:47:24] Workflow completed successfully`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="flex-1 overflow-y-auto px-6">
            <div className="grid grid-cols-3 gap-4 pb-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Total Executions</p>
                  <p className="text-2xl font-semibold mt-1">1,247</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-semibold mt-1">98.4%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Avg Duration</p>
                  <p className="text-2xl font-semibold mt-1">1.1s</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
