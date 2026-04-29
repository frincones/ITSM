'use client';

import { useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
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

import {
  createApiKeyAction,
  revokeApiKeyAction,
} from '~/lib/actions/api-keys';
import {
  ALL_SCOPES,
  type ApiKeyEnvironment,
  type ApiKeyRecord,
} from '~/lib/services/api-key.types';

interface Props {
  keys: ApiKeyRecord[];
}

const SCOPE_GROUPS: { label: string; scopes: readonly string[] }[] = [
  { label: 'Tickets', scopes: ALL_SCOPES.filter((s) => s.startsWith('tickets:')) },
  { label: 'Organizations & contacts', scopes: ALL_SCOPES.filter((s) => s.startsWith('organizations:') || s.startsWith('contacts:')) },
  { label: 'Agents', scopes: ALL_SCOPES.filter((s) => s.startsWith('agents:')) },
  { label: 'Knowledge base', scopes: ALL_SCOPES.filter((s) => s.startsWith('kb:')) },
  { label: 'ITIL (problems / changes / assets)', scopes: ALL_SCOPES.filter((s) => s.startsWith('problems:') || s.startsWith('changes:') || s.startsWith('assets:')) },
  { label: 'SLAs & metrics', scopes: ALL_SCOPES.filter((s) => s.startsWith('slas:') || s.startsWith('metrics:')) },
  { label: 'Audit & webhooks', scopes: ALL_SCOPES.filter((s) => s.startsWith('audit:') || s.startsWith('webhooks:')) },
];

export function ApiKeysClient({ keys }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; plainKey: string } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>('live');
  const [rateLimit, setRateLimit] = useState(60);
  const [scopes, setScopes] = useState<Set<string>>(new Set(['tickets:read']));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleScope(s: string) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function selectAllRead() {
    setScopes(new Set(ALL_SCOPES.filter((s) => s.endsWith(':read') || s.endsWith(':search'))));
  }

  function clearScopes() {
    setScopes(new Set());
  }

  function resetForm() {
    setName('');
    setDescription('');
    setEnvironment('live');
    setRateLimit(60);
    setScopes(new Set(['tickets:read']));
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (scopes.size === 0) {
      setError('Pick at least one scope');
      return;
    }
    startTransition(async () => {
      const result = await createApiKeyAction({
        name: name.trim(),
        description: description.trim() || undefined,
        environment,
        scopes: Array.from(scopes),
        rate_limit_rpm: rateLimit,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreatedKey({ name: result.data.record.name, plainKey: result.data.plainKey });
      setCreateOpen(false);
      resetForm();
    });
  }

  function onRevoke(keyId: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? Clients using this key will stop working immediately.`)) return;
    startTransition(async () => {
      const result = await revokeApiKeyAction(keyId);
      if (!result.ok) alert(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">API Keys & MCP</h1>
          <p className="text-muted-foreground text-sm">
            Manage credentials for external agents, integrations, and the MCP server.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>Create API Key</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New API Key</DialogTitle>
              <DialogDescription>
                Pick a descriptive name and the scopes the key should grant.
                The plain key will be shown ONCE — copy it immediately.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier production" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="env">Environment</Label>
                  <Select value={environment} onValueChange={(v) => setEnvironment(v as ApiKeyEnvironment)}>
                    <SelectTrigger id="env"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">live</SelectItem>
                      <SelectItem value="test">test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="desc">Description (optional)</Label>
                <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this key for?" />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rate">Rate limit (req/min, 0 = unlimited)</Label>
                <Input id="rate" type="number" min={0} max={10000} value={rateLimit} onChange={(e) => setRateLimit(parseInt(e.target.value, 10) || 0)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Scopes</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={selectAllRead}>All read</Button>
                    <Button type="button" size="sm" variant="outline" onClick={clearScopes}>Clear</Button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-3 border rounded p-3">
                  {SCOPE_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">{group.label}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {group.scopes.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={scopes.has(s)} onCheckedChange={() => toggleScope(s)} />
                            <code className="text-xs">{s}</code>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create key'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {createdKey && (
        <Alert>
          <AlertTitle>API key created — copy it now</AlertTitle>
          <AlertDescription>
            <p className="text-sm mb-2">
              This is the only time the plain key for <strong>{createdKey.name}</strong> will be shown.
              Store it in your secret manager.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">{createdKey.plainKey}</code>
              <Button
                size="sm"
                onClick={() => { void navigator.clipboard.writeText(createdKey.plainKey); }}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreatedKey(null)}>Dismiss</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Existing keys</CardTitle>
          <CardDescription>{keys.length} key{keys.length === 1 ? '' : 's'} in this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No API keys yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Env</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const isActive = k.is_active && !k.revoked_at;
                  return (
                    <TableRow key={k.id}>
                      <TableCell>
                        <div className="font-medium">{k.name}</div>
                        {k.description && <div className="text-xs text-muted-foreground">{k.description}</div>}
                      </TableCell>
                      <TableCell><code className="text-xs">{k.key_prefix}…</code></TableCell>
                      <TableCell><Badge variant={k.environment === 'live' ? 'default' : 'secondary'}>{k.environment}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {k.scopes.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                          {k.scopes.length > 3 && <Badge variant="outline" className="text-xs">+{k.scopes.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{k.rate_limit_rpm === 0 ? '∞' : `${k.rate_limit_rpm}/min`}</TableCell>
                      <TableCell className="text-xs">{k.usage_count}</TableCell>
                      <TableCell className="text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}</TableCell>
                      <TableCell>
                        {isActive
                          ? <Badge variant="default">active</Badge>
                          : <Badge variant="destructive">revoked</Badge>}
                      </TableCell>
                      <TableCell>
                        {isActive && (
                          <Button size="sm" variant="ghost" onClick={() => onRevoke(k.id, k.name)}>Revoke</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP endpoint</CardTitle>
          <CardDescription>External agents (Claude Desktop, Cursor, custom) connect to this URL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium w-32">Endpoint:</span>
              <code className="bg-muted px-2 py-1 rounded">POST /api/mcp</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium w-32">Manifest:</span>
              <code className="bg-muted px-2 py-1 rounded">GET /api/mcp/manifest</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium w-32">Auth:</span>
              <code className="bg-muted px-2 py-1 rounded">Authorization: Bearer nvd_live_…</code>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Speaks JSON-RPC 2.0 with the MCP 2025-03-26 spec. Methods:
            <code className="mx-1">initialize</code>,
            <code className="mx-1">tools/list</code>,
            <code className="mx-1">tools/call</code>,
            <code className="mx-1">ping</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
