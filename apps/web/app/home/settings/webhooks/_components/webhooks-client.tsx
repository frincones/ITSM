'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Webhook,
  Play,
  Pause,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@kit/ui/tabs';
import { Switch } from '@kit/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { Checkbox } from '@kit/ui/checkbox';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface WebhookRecord {
  id: string;
  name: string;
  url: string;
  direction: string; // 'inbound' | 'outbound'
  events: string[];
  secret: string | null;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
  [key: string]: unknown;
}

interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  status_code: number | null;
  request_body: string | null;
  response_body: string | null;
  success: boolean;
  created_at: string;
  [key: string]: unknown;
}

interface WebhooksClientProps {
  webhooks: WebhookRecord[];
  webhookLogs: WebhookLog[];
  tenantId: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const AVAILABLE_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.resolved',
  'ticket.deleted',
  'comment.created',
  'agent.assigned',
  'sla.breached',
  'change.created',
  'change.approved',
  'change.deployed',
];

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

const DEMO_WEBHOOKS: WebhookRecord[] = [
  {
    id: 'demo-1',
    name: 'Slack Notifications',
    url: 'https://hooks.slack.com/services/T00/B00/xxx',
    direction: 'outbound',
    events: ['ticket.created', 'ticket.resolved', 'sla.breached'],
    secret: 'whsec_abc123def456',
    is_active: true,
    created_at: '2025-12-01',
    last_triggered_at: '2026-03-25T14:30:00Z',
  },
  {
    id: 'demo-2',
    name: 'Jira Sync',
    url: 'https://jira.company.com/webhook/itsm',
    direction: 'outbound',
    events: ['ticket.created', 'ticket.updated'],
    secret: 'whsec_jira789xyz',
    is_active: true,
    created_at: '2026-01-15',
    last_triggered_at: '2026-03-26T09:15:00Z',
  },
  {
    id: 'demo-3',
    name: 'Email Inbound Parser',
    url: '/api/v1/inbox/webhooks/email',
    direction: 'inbound',
    events: ['email.received'],
    secret: 'whsec_email_inbound',
    is_active: true,
    created_at: '2025-11-10',
    last_triggered_at: '2026-03-26T10:00:00Z',
  },
  {
    id: 'demo-4',
    name: 'Monitoring Alerts',
    url: '/api/v1/inbox/webhooks/monitoring',
    direction: 'inbound',
    events: ['alert.triggered'],
    secret: null,
    is_active: false,
    created_at: '2026-02-20',
    last_triggered_at: null,
  },
];

const DEMO_LOGS: WebhookLog[] = [
  {
    id: 'log-1',
    webhook_id: 'demo-1',
    event: 'ticket.created',
    status_code: 200,
    request_body: '{"event":"ticket.created","ticket_id":"TKT-1234"}',
    response_body: '{"ok":true}',
    success: true,
    created_at: '2026-03-26T10:30:00Z',
  },
  {
    id: 'log-2',
    webhook_id: 'demo-2',
    event: 'ticket.updated',
    status_code: 200,
    request_body: '{"event":"ticket.updated","ticket_id":"TKT-1230"}',
    response_body: '{"status":"synced"}',
    success: true,
    created_at: '2026-03-26T09:15:00Z',
  },
  {
    id: 'log-3',
    webhook_id: 'demo-1',
    event: 'sla.breached',
    status_code: 500,
    request_body: '{"event":"sla.breached","ticket_id":"TKT-1220"}',
    response_body: '{"error":"internal server error"}',
    success: false,
    created_at: '2026-03-25T16:45:00Z',
  },
  {
    id: 'log-4',
    webhook_id: 'demo-3',
    event: 'email.received',
    status_code: 200,
    request_body: null,
    response_body: '{"ticket_created":"TKT-1250"}',
    success: true,
    created_at: '2026-03-26T10:00:00Z',
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WebhooksClient({
  webhooks: serverWebhooks,
  webhookLogs: serverLogs,
  tenantId,
}: WebhooksClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [logDetailId, setLogDetailId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDirection, setFormDirection] = useState('outbound');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const webhooks = serverWebhooks.length > 0 ? serverWebhooks : DEMO_WEBHOOKS;
  const logs = serverLogs.length > 0 ? serverLogs : DEMO_LOGS;

  const inboundWebhooks = webhooks.filter((w) => w.direction === 'inbound');
  const outboundWebhooks = webhooks.filter((w) => w.direction === 'outbound');

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormDirection('outbound');
    setFormSecret('');
    setFormEvents([]);
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    await supabase.from('webhooks').insert({
      tenant_id: tenantId,
      name: formName,
      url: formUrl,
      direction: formDirection,
      events: formEvents,
      secret: formSecret || null,
      is_active: true,
    });
    resetForm();
    setAddOpen(false);
    startTransition(() => router.refresh());
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingId(webhookId);
    // Simulate a test webhook call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestingId(null);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const selectedLog = logDetailId ? logs.find((l) => l.id === logDetailId) : null;

  const renderWebhookCard = (webhook: WebhookRecord) => {
    const webhookLogs = logs.filter((l) => l.webhook_id === webhook.id);
    const successRate =
      webhookLogs.length > 0
        ? Math.round(
            (webhookLogs.filter((l) => l.success).length / webhookLogs.length) *
              100,
          )
        : 100;

    return (
      <Card
        key={webhook.id}
        className={`hover:shadow-md transition-shadow ${
          !webhook.is_active ? 'opacity-60' : ''
        }`}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  webhook.direction === 'inbound'
                    ? 'bg-blue-50'
                    : 'bg-purple-50'
                }`}
              >
                {webhook.direction === 'inbound' ? (
                  <ArrowDownLeft
                    className={`w-5 h-5 ${
                      webhook.direction === 'inbound'
                        ? 'text-blue-600'
                        : 'text-purple-600'
                    }`}
                  />
                ) : (
                  <ArrowUpRight className="w-5 h-5 text-purple-600" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{webhook.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    className={
                      webhook.direction === 'inbound'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }
                  >
                    {webhook.direction}
                  </Badge>
                  <Badge
                    className={
                      webhook.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }
                  >
                    {webhook.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>
                  {webhook.is_active ? 'Disable' : 'Enable'}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* URL */}
          <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg p-2">
            <code className="text-xs text-gray-600 flex-1 truncate">
              {webhook.url}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => copyToClipboard(webhook.url)}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>

          {/* Events */}
          <div className="flex flex-wrap gap-1 mb-3">
            {webhook.events.map((event) => (
              <Badge
                key={event}
                variant="outline"
                className="text-xs font-normal"
              >
                {event}
              </Badge>
            ))}
          </div>

          {/* Secret */}
          {webhook.secret && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-gray-500">Secret:</span>
              <code className="text-gray-600">
                {showSecret[webhook.id]
                  ? webhook.secret
                  : '***************'}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() =>
                  setShowSecret((prev) => ({
                    ...prev,
                    [webhook.id]: !prev[webhook.id],
                  }))
                }
              >
                {showSecret[webhook.id] ? (
                  <EyeOff className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
              </Button>
            </div>
          )}

          {/* Footer stats */}
          <div className="flex items-center justify-between pt-3 border-t text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span>
                Last triggered: {timeAgo(webhook.last_triggered_at)}
              </span>
              <span>
                Success rate:{' '}
                <span
                  className={
                    successRate >= 90
                      ? 'text-green-600'
                      : successRate >= 70
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }
                >
                  {successRate}%
                </span>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={testingId === webhook.id || !webhook.is_active}
              onClick={() => handleTestWebhook(webhook.id)}
            >
              {testingId === webhook.id ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Test
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/home/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Webhooks</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage inbound and outbound webhook integrations
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Webhook</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleAddWebhook}>
                <div>
                  <Label htmlFor="wh-name">Name</Label>
                  <Input
                    id="wh-name"
                    placeholder="Webhook name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="wh-url">URL</Label>
                  <Input
                    id="wh-url"
                    placeholder="https://example.com/webhook"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="wh-direction">Direction</Label>
                  <Select
                    value={formDirection}
                    onValueChange={setFormDirection}
                  >
                    <SelectTrigger id="wh-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="wh-secret">Secret (optional)</Label>
                  <Input
                    id="wh-secret"
                    placeholder="Webhook signing secret"
                    value={formSecret}
                    onChange={(e) => setFormSecret(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Events</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
                    {AVAILABLE_EVENTS.map((event) => (
                      <label
                        key={event}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={formEvents.includes(event)}
                          onCheckedChange={() => toggleEvent(event)}
                        />
                        {event}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      resetForm();
                      setAddOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || !formName || !formUrl}
                  >
                    Add Webhook
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs: Webhooks & Logs */}
      <Tabs defaultValue="webhooks" className="space-y-6">
        <TabsList>
          <TabsTrigger value="webhooks">
            Webhooks ({webhooks.length})
          </TabsTrigger>
          <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
        </TabsList>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-6">
          {/* Outbound */}
          {outboundWebhooks.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4" />
                Outbound ({outboundWebhooks.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {outboundWebhooks.map(renderWebhookCard)}
              </div>
            </div>
          )}

          {/* Inbound */}
          {inboundWebhooks.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4" />
                Inbound ({inboundWebhooks.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {inboundWebhooks.map(renderWebhookCard)}
              </div>
            </div>
          )}

          {webhooks.length === 0 && (
            <div className="text-center py-12">
              <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No webhooks configured yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Add a webhook to integrate with external services
              </p>
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Webhook</TableHead>
                  <TableHead>HTTP Code</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No webhook logs yet</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const webhook = webhooks.find(
                      (w) => w.id === log.webhook_id,
                    );
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setLogDetailId(log.id)}
                      >
                        <TableCell>
                          {log.success ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs font-normal"
                          >
                            {log.event}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-900">
                            {webhook?.name ?? 'Unknown'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              log.status_code && log.status_code < 300
                                ? 'bg-green-100 text-green-700'
                                : log.status_code && log.status_code < 500
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                            }
                          >
                            {log.status_code ?? '--'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-gray-500">
                            {timeAgo(log.created_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Log Detail Dialog */}
          {selectedLog && (
            <Dialog
              open={!!selectedLog}
              onOpenChange={(open) => !open && setLogDetailId(null)}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedLog.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    Webhook Log Detail
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Event</p>
                      <p className="font-medium">{selectedLog.event}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Status Code</p>
                      <p className="font-medium">
                        {selectedLog.status_code ?? '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Time</p>
                      <p className="font-medium">
                        {new Date(selectedLog.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Result</p>
                      <Badge
                        className={
                          selectedLog.success
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }
                      >
                        {selectedLog.success ? 'Success' : 'Failed'}
                      </Badge>
                    </div>
                  </div>

                  {selectedLog.request_body && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Request Body
                      </p>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto max-h-32">
                        {JSON.stringify(
                          JSON.parse(selectedLog.request_body),
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  )}

                  {selectedLog.response_body && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Response Body
                      </p>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto max-h-32">
                        {JSON.stringify(
                          JSON.parse(selectedLog.response_body),
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
