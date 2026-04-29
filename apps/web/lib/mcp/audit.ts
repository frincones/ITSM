// ---------------------------------------------------------------------------
// MCP Audit Writer
// ---------------------------------------------------------------------------
// Records every tool call (success or failure) into mcp_audit_log.
// Inserts use the service-role client; RLS does NOT block them.
// Intentionally fire-and-forget at the call site — auditing must never
// fail a successful tool call.
// ---------------------------------------------------------------------------

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { McpChannel } from './context';

export type AuditStatus =
  | 'success'
  | 'error'
  | 'forbidden'
  | 'rate_limited'
  | 'invalid_input'
  | 'unauthorized';

export interface AuditEntry {
  tenantId: string;
  apiKeyId: string | null;
  agentId: string | null;
  channel: McpChannel;
  toolName: string;
  status: AuditStatus;
  statusCode: number;
  arguments?: unknown;
  errorMessage?: string | null;
  durationMs: number;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Sanitizes arguments before persisting: strips obvious secret fields,
 * caps payload size to prevent unbounded growth in mcp_audit_log.
 */
function sanitizeArguments(args: unknown): unknown {
  if (args === null || args === undefined) return null;
  try {
    const json = JSON.stringify(args, (key, value) => {
      const lowered = key.toLowerCase();
      if (
        lowered.includes('password') ||
        lowered.includes('secret') ||
        lowered.includes('token') ||
        lowered === 'authorization' ||
        lowered === 'apikey' ||
        lowered === 'api_key'
      ) {
        return '[REDACTED]';
      }
      return value;
    });
    // Cap at 8KB to keep the audit table lean.
    if (json.length > 8192) {
      return { _truncated: true, _size: json.length };
    }
    return JSON.parse(json);
  } catch {
    return { _unserializable: true };
  }
}

export async function recordMcpCall(
  client: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    await client.from('mcp_audit_log').insert({
      tenant_id: entry.tenantId,
      api_key_id: entry.apiKeyId,
      agent_id: entry.agentId,
      channel: entry.channel,
      tool_name: entry.toolName,
      status: entry.status,
      status_code: entry.statusCode,
      arguments: sanitizeArguments(entry.arguments),
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      request_id: entry.requestId ?? null,
    });
  } catch (err) {
    // Auditing must not break the call. Log to server console only.
    console.error('[mcp.audit] failed to persist entry', err);
  }
}
