// ---------------------------------------------------------------------------
// MCP Tools — Agents (read-only)
// ---------------------------------------------------------------------------
// Agents are NovaDesk staff. External callers usually need to read this
// list to assign tickets or display ownership. Write operations stay in
// the UI / admin actions and are NOT exposed via MCP.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const AGENT_COLUMNS =
  'id, name, email, role, skills, avatar_url, is_active, last_active_at, created_at';

registry.register({
  name: 'agents.list',
  description: 'List agents (NovaDesk staff) in the tenant. Read-only.',
  scope: 'agents:read',
  inputSchema: PaginationInput.extend({
    is_active: z.boolean().default(true),
    role: z.enum(['admin', 'supervisor', 'agent', 'readonly']).optional(),
  }),
  meta: { since: '1.0.0', tags: ['agents', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);

    let q = ctx.supabase
      .from('agents')
      .select(AGENT_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('name', { ascending: true })
      .range(from, to);

    if (typeof input.is_active === 'boolean') q = q.eq('is_active', input.is_active);
    if (input.role) q = q.eq('role', input.role);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'agents.get',
  description: 'Get a single agent by id.',
  scope: 'agents:read',
  inputSchema: z.object({ id: z.string().uuid() }),
  meta: { since: '1.0.0', tags: ['agents', 'read'] },
  async handler(ctx, input) {
    const { data, error } = await ctx.supabase
      .from('agents')
      .select(AGENT_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', input.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Agent not found');
    return { agent: data };
  },
});

// Marker: imported by lib/mcp/server.ts to defeat tree-shaking.
export const __agentsToolsLoaded = true;
