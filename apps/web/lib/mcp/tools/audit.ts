// ---------------------------------------------------------------------------
// MCP Tools — Audit Log (read-only)
// ---------------------------------------------------------------------------
// Exposes the existing `audit_logs` table (UI mutations) AND the new
// `mcp_audit_log` table (MCP/REST tool calls). Two separate tools keep
// the surface explicit.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

registry.register({
  name: 'audit_list',
  description: 'List entries from audit_logs (UI/agent mutations) for the tenant. Filter by resource_type, resource_id, user_id, action, and date.',
  scope: 'audit:read',
  inputSchema: PaginationInput.extend({
    resource_type: z.string().min(1).optional(),
    resource_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    action: z.string().min(1).optional(),
    created_after: z.string().datetime().optional(),
    created_before: z.string().datetime().optional(),
  }),
  meta: { since: '1.0.0', tags: ['audit', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    let q = ctx.supabase
      .from('audit_logs')
      .select('id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent, created_at', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (input.resource_type) q = q.eq('resource_type', input.resource_type);
    if (input.resource_id) q = q.eq('resource_id', input.resource_id);
    if (input.user_id) q = q.eq('user_id', input.user_id);
    if (input.action) q = q.eq('action', input.action);
    if (input.created_after) q = q.gte('created_at', input.created_after);
    if (input.created_before) q = q.lte('created_at', input.created_before);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'audit_mcp_calls',
  description: 'List MCP/REST tool-call audit entries for the tenant. Filter by tool_name, status, api_key_id, and date.',
  scope: 'audit:read',
  inputSchema: PaginationInput.extend({
    tool_name: z.string().min(1).optional(),
    status: z.enum(['success', 'error', 'forbidden', 'rate_limited', 'invalid_input', 'unauthorized']).optional(),
    api_key_id: z.string().uuid().optional(),
    channel: z.enum(['mcp', 'rest', 'internal']).optional(),
    created_after: z.string().datetime().optional(),
    created_before: z.string().datetime().optional(),
  }),
  meta: { since: '1.0.0', tags: ['audit', 'read', 'mcp'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);
    let q = ctx.supabase
      .from('mcp_audit_log')
      .select('id, api_key_id, agent_id, channel, tool_name, status, status_code, arguments, error_message, duration_ms, ip_address, request_id, created_at', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (input.tool_name) q = q.eq('tool_name', input.tool_name);
    if (input.status) q = q.eq('status', input.status);
    if (input.api_key_id) q = q.eq('api_key_id', input.api_key_id);
    if (input.channel) q = q.eq('channel', input.channel);
    if (input.created_after) q = q.gte('created_at', input.created_after);
    if (input.created_before) q = q.lte('created_at', input.created_before);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __auditToolsLoaded = true;
