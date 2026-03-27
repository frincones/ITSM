'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Brain,
  Sparkles,
  Shield,
  Zap,
  BarChart3,
  Database,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Save,
  Globe,
  FileText,
  GitBranch,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Separator } from '@kit/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AiAgent {
  id: string;
  tenant_id: string;
  agent_type: string;
  name: string;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  tools_enabled: string[] | null;
  knowledge_sources: unknown;
  is_active: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface KnowledgeDoc {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  created_at: string;
  last_synced_at: string | null;
}

interface AiSettingsClientProps {
  tenantId: string;
  aiAgents: AiAgent[];
  knowledgeDocCount: number;
  knowledgeDocs: KnowledgeDoc[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function agentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    triage: 'Auto-Triage',
    support: 'Support Assistant',
    resolution: 'Resolution Agent',
    routing: 'Smart Routing',
    escalation: 'Escalation Manager',
    analytics: 'Analytics Engine',
    quality: 'Quality Assurance',
    inbox: 'Inbox Agent',
  };
  return labels[type] ?? type;
}

function agentTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    triage:
      'Automatically classifies tickets by type, urgency, and category on creation.',
    support:
      'Assists agents in real-time with suggestions and knowledge base lookups.',
    resolution:
      'Generates step-by-step resolution plans using RAG and historical data.',
    routing:
      'Routes tickets to the best-suited agent or group based on skills and workload.',
    escalation:
      'Monitors SLA timers and triggers automatic escalation workflows.',
    analytics:
      'Generates reports, detects trends, and provides actionable insights.',
    quality:
      'Reviews agent responses for quality, tone, and completeness.',
    inbox:
      'Processes incoming emails, extracts data, and creates structured tickets.',
  };
  return descriptions[type] ?? '';
}

function agentTypeIcon(type: string) {
  const icons: Record<string, typeof Bot> = {
    triage: Sparkles,
    support: MessageSquare,
    resolution: Brain,
    routing: Zap,
    escalation: Shield,
    analytics: BarChart3,
    quality: Shield,
    inbox: MessageSquare,
  };
  const Icon = icons[type] ?? Bot;
  return <Icon className="h-5 w-5" />;
}

function sourceTypeIcon(type: string) {
  const icons: Record<string, typeof Globe> = {
    kb_article: FileText,
    repository: GitBranch,
    document: FileText,
    transcript: MessageSquare,
    user_story: FileText,
    webpage: Globe,
    ticket_solution: Brain,
  };
  const Icon = icons[type] ?? FileText;
  return <Icon className="h-4 w-4" />;
}

function sourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kb_article: 'KB Article',
    repository: 'Repository',
    document: 'Document',
    transcript: 'Transcript',
    user_story: 'User Story',
    webpage: 'Webpage',
    ticket_solution: 'Ticket Solution',
  };
  return labels[type] ?? type;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AiSettingsClient({
  tenantId,
  aiAgents,
  knowledgeDocCount,
  knowledgeDocs,
}: AiSettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Local state for agent toggles ────────────────────────────────────────
  const [agents, setAgents] = useState<AiAgent[]>(aiAgents);
  const [model, setModel] = useState('gpt-4o-mini');
  const [confidenceThreshold, setConfidenceThreshold] = useState('80');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceType, setNewSourceType] = useState<string>('webpage');

  // ── Derive usage metrics (placeholder — would come from a usage table) ───
  const totalQueries = 1247;
  const monthlyLimit = 5000;
  const usagePercent = Math.round((totalQueries / monthlyLimit) * 100);

  // ── Toggle agent active ──────────────────────────────────────────────────
  function handleToggleAgent(agentId: string, active: boolean) {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, is_active: active } : a)),
    );
  }

  // ── Save configuration (placeholder — connect to server action) ──────────
  function handleSave() {
    // TODO: wire to server action to persist ai_agents config
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/home/settings?section=ai')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </div>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          AI Configuration
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage AI agents, model settings, and knowledge sources for your
          workspace.
        </p>
      </div>

      {/* ================================================================== */}
      {/*  Usage Metrics                                                     */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>AI Usage</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Queries This Month
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {totalQueries.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monthly Limit
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {monthlyLimit.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Knowledge Documents
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {knowledgeDocCount}
              </p>
            </div>
          </div>
          {/* Usage bar */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Usage</span>
              <span>
                {totalQueries.toLocaleString()} / {monthlyLimit.toLocaleString()}{' '}
                ({usagePercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent > 80
                    ? 'bg-red-500'
                    : usagePercent > 50
                      ? 'bg-yellow-500'
                      : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/*  Model Configuration                                               */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle>Model Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ai-model">AI Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="ai-model" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Model used for all AI operations
              </p>
            </div>
            <div>
              <Label htmlFor="confidence-threshold">
                Confidence Threshold (%)
              </Label>
              <Input
                id="confidence-threshold"
                type="number"
                min={0}
                max={100}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(e.target.value)}
                className="mt-2"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Minimum confidence for automatic actions (classification,
                routing)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/*  AI Agents                                                         */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>AI Agents</CardTitle>
            </div>
            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
              {agents.filter((a) => a.is_active).length} / {agents.length}{' '}
              active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="py-8 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No AI agents configured yet.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                AI agents will appear here once provisioned for your tenant.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    agent.is_active
                      ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/5'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          agent.is_active
                            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                            : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {agentTypeIcon(agent.agent_type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {agent.name}
                          </h4>
                          <Badge
                            className={`text-[10px] ${
                              agent.is_active
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {agent.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {agentTypeDescription(agent.agent_type)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge className="border-gray-200 bg-white text-[10px] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {agentTypeLabel(agent.agent_type)}
                          </Badge>
                          <Badge className="border-gray-200 bg-white text-[10px] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {agent.model ?? 'gpt-4o-mini'}
                          </Badge>
                          {agent.temperature !== null && (
                            <Badge className="border-gray-200 bg-white text-[10px] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                              temp: {agent.temperature}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={(checked) =>
                        handleToggleAgent(agent.id, checked)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/*  Knowledge Sources                                                  */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>Knowledge Sources</CardTitle>
            </div>
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {knowledgeDocCount} documents
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new source */}
          <div className="rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
            <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
              Add Knowledge Source
            </h4>
            <div className="flex items-end gap-3">
              <div className="w-40">
                <Label htmlFor="source-type">Type</Label>
                <Select value={newSourceType} onValueChange={setNewSourceType}>
                  <SelectTrigger id="source-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webpage">Webpage / URL</SelectItem>
                    <SelectItem value="repository">Repository</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="source-url">URL / Path</Label>
                <Input
                  id="source-url"
                  placeholder="https://docs.example.com or repo URL..."
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button size="sm" disabled={!newSourceUrl.trim()}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <Separator />

          {/* Existing sources */}
          {knowledgeDocs.length === 0 ? (
            <div className="py-6 text-center">
              <Database className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No knowledge sources added yet.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Add URLs, repositories, or documents to enhance AI suggestions.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {knowledgeDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {sourceTypeIcon(doc.source_type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {doc.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-gray-100 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          {sourceTypeLabel(doc.source_type)}
                        </Badge>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          Added {formatDate(doc.created_at)}
                        </span>
                        {doc.last_synced_at && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            Synced {formatDate(doc.last_synced_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {doc.source_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        asChild
                      >
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Re-sync"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/*  Save Button                                                       */}
      {/* ================================================================== */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          <Save className="mr-2 h-4 w-4" />
          Save AI Configuration
        </Button>
      </div>
    </div>
  );
}
