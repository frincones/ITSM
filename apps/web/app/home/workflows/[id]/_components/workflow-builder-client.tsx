'use client';

import { useState } from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
  Bot,
  CheckCircle,
  Clock,
  Copy,
  GitBranch,
  Mail,
  Play,
  Plus,
  Save,
  Settings,
  Trash2,
  User,
  Webhook,
  Zap,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kit/ui/tabs';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface WorkflowStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  order_index: number;
}

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  steps: WorkflowStep[];
}

interface WorkflowBuilderClientProps {
  workflow: WorkflowDetail;
}

/* -------------------------------------------------------------------------- */
/*  Static Data                                                                */
/* -------------------------------------------------------------------------- */

const availableBlocks = [
  {
    category: 'Triggers',
    items: [
      { type: 'trigger', icon: Zap, label: 'Ticket Created', color: 'text-indigo-600 bg-indigo-50' },
      { type: 'trigger', icon: Zap, label: 'Ticket Updated', color: 'text-indigo-600 bg-indigo-50' },
      { type: 'trigger', icon: Clock, label: 'Schedule', color: 'text-blue-600 bg-blue-50' },
      { type: 'trigger', icon: Mail, label: 'Email Received', color: 'text-green-600 bg-green-50' },
    ],
  },
  {
    category: 'Conditions',
    items: [
      { type: 'condition', icon: GitBranch, label: 'If/Else', color: 'text-orange-600 bg-orange-50' },
      { type: 'condition', icon: Bot, label: 'AI Decision', color: 'text-purple-600 bg-purple-50' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { type: 'action', icon: User, label: 'Assign Agent', color: 'text-gray-600 bg-gray-50' },
      { type: 'action', icon: Mail, label: 'Send Email', color: 'text-green-600 bg-green-50' },
      { type: 'action', icon: Webhook, label: 'Call Webhook', color: 'text-red-600 bg-red-50' },
      { type: 'action', icon: Clock, label: 'Wait/Delay', color: 'text-yellow-600 bg-yellow-50' },
    ],
  },
];

const executionLogs = [
  {
    id: 1,
    trigger: 'Ticket #TKT-1247 created',
    status: 'completed' as const,
    duration: '1.2s',
    timestamp: '2 min ago',
    steps_executed: 4,
  },
  {
    id: 2,
    trigger: 'Ticket #TKT-1245 SLA warning',
    status: 'completed' as const,
    duration: '0.8s',
    timestamp: '15 min ago',
    steps_executed: 3,
  },
  {
    id: 3,
    trigger: 'Schedule: Every 24h',
    status: 'running' as const,
    duration: '\u2014',
    timestamp: 'Just now',
    steps_executed: 2,
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getStepIcon(type: string) {
  switch (type) {
    case 'trigger':
      return Zap;
    case 'condition':
      return GitBranch;
    default:
      return User;
  }
}

function getStepColors(type: string) {
  switch (type) {
    case 'trigger':
      return { bg: 'bg-indigo-50 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' };
    case 'condition':
      return { bg: 'bg-orange-50 text-orange-600', badge: 'bg-orange-100 text-orange-700' };
    default:
      return { bg: 'bg-gray-50 text-gray-600', badge: 'bg-gray-100 text-gray-700' };
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WorkflowBuilderClient({
  workflow,
}: WorkflowBuilderClientProps) {
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [steps] = useState<WorkflowStep[]>(workflow.steps);

  const selectedStepData = steps.find((s) => s.id === selectedStep);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/home/workflows">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {workflow.name}
              </h1>
              <p className="text-sm text-gray-500">
                {workflow.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={`${
                workflow.is_active
                  ? 'border-green-200 bg-green-100 text-green-700'
                  : 'border-gray-200 bg-gray-100 text-gray-700'
              }`}
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              {workflow.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Button variant="outline" size="sm">
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>
            <Button variant="outline" size="sm">
              <Play className="mr-2 h-4 w-4" />
              Test Run
            </Button>
            <Button variant="default" size="sm">
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Available Blocks */}
        <div className="w-64 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <div className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Building Blocks
            </h3>
            <div className="space-y-4">
              {availableBlocks.map((category) => (
                <div key={category.category}>
                  <h4 className="mb-2 text-xs font-medium text-gray-500">
                    {category.category}
                  </h4>
                  <div className="space-y-2">
                    {category.items.map((block, idx) => (
                      <div
                        key={`${block.label}-${idx}`}
                        className={`${block.color} cursor-move rounded-lg border border-gray-200 p-3 transition-shadow hover:shadow-sm`}
                        draggable
                      >
                        <div className="flex items-center gap-2">
                          <block.icon className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            {block.label}
                          </span>
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
        <div className="flex-1 overflow-auto bg-gray-100">
          <div className="p-8">
            <div className="relative" style={{ minHeight: '800px' }}>
              {/* Grid Background */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                    linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
                  `,
                  backgroundSize: '20px 20px',
                }}
              />

              {/* Workflow Steps */}
              {steps.map((step, idx) => {
                const isSelected = selectedStep === step.id;
                const Icon = getStepIcon(step.type);
                const colors = getStepColors(step.type);

                return (
                  <div key={step.id}>
                    {/* Connector Line */}
                    {idx > 0 && (
                      <div
                        className="absolute w-0.5 bg-gray-300"
                        style={{
                          left: step.position.x + 150,
                          top: step.position.y - 20,
                          height: '20px',
                        }}
                      />
                    )}

                    {/* Step Block */}
                    <div
                      className={`absolute cursor-pointer rounded-lg border-2 bg-white p-4 shadow-sm transition-all ${
                        isSelected
                          ? 'border-indigo-500 shadow-lg'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{
                        left: step.position.x,
                        top: step.position.y,
                        width: '300px',
                      }}
                      onClick={() => setSelectedStep(step.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between">
                            <Badge className={`text-xs ${colors.badge}`}>
                              {step.type}
                            </Badge>
                          </div>
                          <h4 className="mb-2 text-sm font-medium text-gray-900">
                            {step.name}
                          </h4>
                          <p className="line-clamp-2 text-xs text-gray-600">
                            {JSON.stringify(step.config)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add Step Button */}
              {steps.length > 0 && (
                <div
                  className="absolute"
                  style={{
                    left: 100,
                    top:
                      steps[steps.length - 1]!.position.y + 120,
                  }}
                >
                  <Button variant="outline" className="border-dashed">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Step
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 overflow-y-auto border-l border-gray-200 bg-white">
          {selectedStepData ? (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Step Properties
                </h3>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Step Name
                  </label>
                  <Input defaultValue={selectedStepData.name} />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Step Type
                  </label>
                  <Select defaultValue={selectedStepData.type}>
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
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Configuration
                  </label>
                  <Card>
                    <CardContent className="p-3">
                      <pre className="whitespace-pre-wrap text-xs text-gray-600">
                        {JSON.stringify(selectedStepData.config, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>

                <Button className="w-full">
                  <Settings className="mr-2 h-4 w-4" />
                  Advanced Settings
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100">
                <Settings className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">
                Select a step to view and edit its properties
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel - Executions Log */}
      <div className="h-64 overflow-y-auto border-t border-gray-200 bg-white">
        <Tabs defaultValue="executions" className="flex h-full flex-col">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="executions">Recent Executions</TabsTrigger>
              <TabsTrigger value="logs">Debug Logs</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="executions"
            className="flex-1 overflow-y-auto px-6"
          >
            <div className="space-y-2 pb-4">
              {executionLogs.map((execution) => (
                <div
                  key={execution.id}
                  className="flex cursor-pointer items-center gap-4 rounded-lg border border-gray-200 p-3 hover:border-gray-300"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      execution.status === 'completed'
                        ? 'bg-green-500'
                        : execution.status === 'running'
                          ? 'animate-pulse bg-blue-500'
                          : 'bg-red-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {execution.trigger}
                      </span>
                      <Badge
                        className={`text-xs ${
                          execution.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : execution.status === 'running'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {execution.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{execution.steps_executed} steps</span>
                      <span>{execution.duration}</span>
                      <span>{execution.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent
            value="logs"
            className="flex-1 overflow-y-auto px-6"
          >
            <div className="pb-4">
              <pre className="rounded-lg bg-gray-50 p-4 text-xs text-gray-600">
                {`[2026-03-26 10:47:23] Workflow triggered: ticket.created
[2026-03-26 10:47:23] Step 1: Ticket Created - PASSED
[2026-03-26 10:47:24] Step 2: Priority = Critical? - TRUE
[2026-03-26 10:47:24] Step 3: Assign to Network Team - EXECUTED
[2026-03-26 10:47:24] Step 4: Send Email Notification - EXECUTED
[2026-03-26 10:47:24] Workflow completed successfully`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent
            value="metrics"
            className="flex-1 overflow-y-auto px-6"
          >
            <div className="grid grid-cols-3 gap-4 pb-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Total Executions</p>
                  <p className="mt-1 text-2xl font-semibold">1,247</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="mt-1 text-2xl font-semibold">98.4%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600">Avg Duration</p>
                  <p className="mt-1 text-2xl font-semibold">1.1s</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
