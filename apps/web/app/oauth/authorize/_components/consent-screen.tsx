// ---------------------------------------------------------------------------
// OAuth consent screen
// ---------------------------------------------------------------------------
// What the user actually decides on. Two things drive the design:
//
// 1. Scopes are shown in plain language. "tickets:write" tells the person
//    approving nothing useful, and a consent screen nobody understands is a
//    rubber stamp rather than a control.
// 2. Write and destructive scopes are marked, because the difference between
//    reading tickets and deleting them is the whole decision.
//
// Scopes can be unchecked individually: a client asking for more than it
// needs should not be all-or-nothing.
// ---------------------------------------------------------------------------

'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';

import { submitConsentAction } from '../_lib/consent-action';

/** Plain-language labels. Falls back to the raw scope when unmapped. */
const SCOPE_LABELS: Record<string, string> = {
  'tickets:read': 'View tickets and their history',
  'tickets:write': 'Create and update tickets',
  'tickets:comment': 'Add comments and replies to tickets',
  'tickets:assign': 'Assign tickets to agents',
  'tickets:delete': 'Delete tickets',
  'organizations:read': 'View client organizations',
  'organizations:write': 'Create and update client organizations',
  'organizations:deactivate': 'Deactivate clients, taking their portal offline',
  'contacts:read': 'View contacts',
  'contacts:write': 'Create and update contacts',
  'agents:read': 'View the agent directory',
  'kb:read': 'Read knowledge base articles',
  'kb:search': 'Search the knowledge base',
  'kb:write': 'Create and edit knowledge base articles',
  'kb:publish': 'Publish articles publicly in the customer portal',
  'problems:read': 'View problem records',
  'problems:write': 'Create and update problem records',
  'changes:read': 'View change requests',
  'changes:write': 'Create and update change requests',
  'changes:approve': 'Approve change requests',
  'assets:read': 'View assets and inventory',
  'assets:write': 'Create and update assets',
  'slas:read': 'View SLA definitions and compliance',
  'metrics:read': 'View operational metrics',
  'audit:read': 'Read the audit log',
  'webhooks:manage': 'Create and manage webhooks',
  'inbox:read': 'Read inbox conversations',
  'inbox:write': 'Triage and update inbox conversations',
  'inbox:reply': 'Send replies to customers over WhatsApp and email',
  'automation:read': 'View automation rules and workflows',
  'automation:write': 'Create and edit automation rules',
  'automation:activate': 'Switch automation on, affecting live tickets',
  'reports:read': 'View reports',
  'catalog:read': 'View the service catalog',
  'nps:read': 'View satisfaction survey results',
  'portal:read': 'View customer portal data',
  'projects:read': 'View projects',
  'projects:write': 'Create and update projects',
  'notifications:read': 'View notifications',
  'search:read': 'Search across the workspace',
};

/** Scopes whose effects reach customers or destroy data. */
const HIGH_RISK = new Set([
  'tickets:delete',
  'organizations:deactivate',
  'inbox:reply',
  'kb:publish',
  'automation:activate',
  'changes:approve',
  'webhooks:manage',
]);

function isWrite(scope: string) {
  return !scope.endsWith(':read') && !scope.endsWith(':search');
}

export interface ConsentScreenProps {
  rawQuery: string;
  resource: string;
  clientName: string;
  clientUri: string | null;
  clientId: string;
  isDynamic: boolean;
  redirectUri: string;
  scopes: string[];
  agentName: string;
  agentEmail: string;
  agentRole: string;
}

export function ConsentScreen(props: ConsentScreenProps) {
  const [granted, setGranted] = useState<string[]>(props.scopes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Read first, then writes, then the risky ones last — the list reads as an
  // escalation rather than an alphabetical jumble.
  const ordered = useMemo(() => {
    return [...props.scopes].sort((a, b) => {
      const rank = (s: string) => (HIGH_RISK.has(s) ? 2 : isWrite(s) ? 1 : 0);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }, [props.scopes]);

  const riskyCount = ordered.filter((s) => HIGH_RISK.has(s)).length;

  function submit(decision: 'approve' | 'deny') {
    setError(null);
    startTransition(async () => {
      const result = await submitConsentAction({
        rawQuery: props.rawQuery,
        grantedScopes: granted,
        decision,
        resource: props.resource,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Back to the client. A full navigation, not a router push: the
      // destination is outside this app.
      window.location.href = result.redirectTo;
    });
  }

  const redirectHost = (() => {
    try {
      return new URL(props.redirectUri).host;
    } catch {
      return props.redirectUri;
    }
  })();

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-xl border shadow-sm">
        <div className="border-b p-6">
          <h1 className="text-lg font-semibold">
            Connect{' '}
            <span className="text-indigo-600 dark:text-indigo-400">{props.clientName}</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This application is requesting access to your NovaDesk workspace.
          </p>
        </div>

        <div className="space-y-5 p-6">
          <div className="bg-muted/50 rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="text-right font-medium">
                {props.agentName}
                <span className="text-muted-foreground block text-xs font-normal">
                  {props.agentEmail} · {props.agentRole}
                </span>
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">Will return to</span>
              <span className="text-right font-mono text-xs break-all">{redirectHost}</span>
            </div>
          </div>

          {props.isDynamic ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              This application registered itself and its identity has not been verified by
              anyone. Approve it only if you started this connection yourself and recognise
              where it is returning you to.
            </p>
          ) : null}

          <div>
            <p className="mb-3 text-sm font-medium">
              It will be able to:
              {riskyCount > 0 ? (
                <span className="text-muted-foreground ml-1 font-normal">
                  ({riskyCount} sensitive)
                </span>
              ) : null}
            </p>

            <ul className="space-y-2">
              {ordered.map((scope) => {
                const checked = granted.includes(scope);
                const risky = HIGH_RISK.has(scope);

                return (
                  <li key={scope} className="flex items-start gap-3">
                    <Checkbox
                      id={scope}
                      checked={checked}
                      disabled={pending}
                      onCheckedChange={(value) => {
                        setGranted((prev) =>
                          value === true
                            ? [...new Set([...prev, scope])]
                            : prev.filter((s) => s !== scope),
                        );
                      }}
                      className="mt-0.5"
                    />
                    <label htmlFor={scope} className="cursor-pointer text-sm leading-snug">
                      <span className={risky ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>
                        {SCOPE_LABELS[scope] ?? scope}
                      </span>
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                        {scope}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <p className="text-muted-foreground mt-3 text-xs">
              Uncheck anything it does not need. Access applies to your workspace and follows
              your own permissions — this connection cannot do more than you can.
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t p-6">
          <Button variant="outline" disabled={pending} onClick={() => submit('deny')}>
            Cancel
          </Button>
          <Button disabled={pending || granted.length === 0} onClick={() => submit('approve')}>
            {pending ? 'Authorizing…' : 'Authorize'}
          </Button>
        </div>
      </div>
    </div>
  );
}
