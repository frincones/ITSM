/**
 * Tools exposed to the NovaDesk AI Assistant (the /api/ai/assistant route).
 *
 * Each tool is a thin wrapper around a Supabase query. The LLM picks which
 * tool to call based on the user's question — replacing the ~40 hardcoded
 * `if(msg.includes(...))` intents that the previous implementation used.
 *
 * All queries are scoped to ctx.tenantId for multi-tenant safety.
 */

import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export interface ToolContext {
  svc: SupabaseClient;
  tenantId: string;
  userId: string;
  agentId?: string;
  agentName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveOrgId(ctx: ToolContext, value: string): Promise<string | null> {
  if (UUID_RE.test(value)) return value;
  const { data } = await ctx.svc
    .from('organizations')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .ilike('name', `%${escapeIlike(value)}%`)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveAgentId(
  ctx: ToolContext,
  value: string,
): Promise<string | 'unassigned' | null> {
  const v = value.trim().toLowerCase();
  if (v === 'unassigned' || v === 'sin asignar' || v === 'nadie') return 'unassigned';
  if (UUID_RE.test(value)) return value;
  const esc = escapeIlike(value);
  const { data } = await ctx.svc
    .from('agents')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .or(`name.ilike.%${esc}%,email.ilike.%${esc}%`)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

interface TicketRow {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  type: string;
  urgency: string;
  requester_email: string | null;
  requester_id: string | null;
  assigned_agent_id: string | null;
  organization_id: string | null;
  created_at: string;
  closed_at?: string | null;
  resolved_at?: string | null;
}

async function enrichTickets(ctx: ToolContext, tickets: TicketRow[]) {
  if (!tickets.length) return [];

  const orgIds = [...new Set(tickets.map((t) => t.organization_id).filter(Boolean))] as string[];
  const agentIds = [...new Set(tickets.map((t) => t.assigned_agent_id).filter(Boolean))] as string[];
  const reqIds = [...new Set(tickets.map((t) => t.requester_id).filter(Boolean))] as string[];

  const [orgsRes, agentsRes, contactsRes] = await Promise.all([
    orgIds.length
      ? ctx.svc.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    agentIds.length
      ? ctx.svc.from('agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    reqIds.length
      ? ctx.svc.from('contacts').select('id, name, email').in('id', reqIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
  ]);

  const orgMap = new Map((orgsRes.data as { id: string; name: string }[] ?? []).map((o) => [o.id, o.name]));
  const agentMap = new Map((agentsRes.data as { id: string; name: string }[] ?? []).map((a) => [a.id, a.name]));
  const contactMap = new Map(
    (contactsRes.data as { id: string; name: string; email: string }[] ?? []).map((c) => [
      c.id,
      { name: c.name, email: c.email },
    ]),
  );

  return tickets.map((t) => ({
    ticket_number: t.ticket_number,
    title: t.title,
    status: t.status,
    type: t.type,
    urgency: t.urgency,
    organization: t.organization_id ? orgMap.get(t.organization_id) ?? null : null,
    assignee: t.assigned_agent_id ? agentMap.get(t.assigned_agent_id) ?? null : null,
    requester: t.requester_id
      ? contactMap.get(t.requester_id)?.name ?? null
      : null,
    requester_email: t.requester_email,
    created_at: t.created_at,
    closed_at: t.closed_at ?? null,
    resolved_at: t.resolved_at ?? null,
  }));
}

// ── Tools ────────────────────────────────────────────────────────────────

const TICKET_COLS =
  'id, ticket_number, title, status, type, urgency, requester_email, requester_id, assigned_agent_id, organization_id, created_at, closed_at, resolved_at';

export function buildAssistantTools(ctx: ToolContext) {
  const tools = {
    // ════════════════════════════════════════════════════════════════════
    //                         READ TOOLS
    // ════════════════════════════════════════════════════════════════════

    search_tickets: tool({
      description:
        'Busca tickets por texto libre en el título, la descripción y los comentarios/notas. Úsalo cuando el usuario pregunte cosas como "tickets sobre X", "casos que mencionen Y", o "errores relacionados con Z".',
      inputSchema: z.object({
        query: z.string().describe('Texto a buscar. Acepta una o varias palabras clave.'),
        status: z
          .array(z.string())
          .optional()
          .describe('Filtrar por estados (p.ej. ["pending","in_progress","new","assigned","testing"]).'),
        type: z
          .string()
          .optional()
          .describe('Filtrar por tipo: incident, request, warranty, support, backlog, desarrollo_pendiente.'),
        organization: z.string().optional().describe('Nombre o UUID del cliente.'),
        limit: z.number().int().min(1).max(200).optional().default(50),
      }),
      execute: async ({ query, status, type, organization, limit }) => {
        const esc = escapeIlike(query);
        let orgId: string | null = null;
        if (organization) {
          orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { tickets: [], total: 0, note: `No se encontró cliente "${organization}".` };
        }

        let q1 = ctx.svc
          .from('tickets')
          .select(TICKET_COLS)
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .or(`title.ilike.%${esc}%,description.ilike.%${esc}%`)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (status?.length) q1 = q1.in('status', status);
        if (type) q1 = q1.eq('type', type);
        if (orgId) q1 = q1.eq('organization_id', orgId);
        const { data: byText } = await q1;

        const { data: followupHits } = await ctx.svc
          .from('ticket_followups')
          .select('ticket_id')
          .eq('tenant_id', ctx.tenantId)
          .ilike('content', `%${esc}%`)
          .limit(300);
        const followupTicketIds = [
          ...new Set((followupHits ?? []).map((f) => (f as { ticket_id: string }).ticket_id)),
        ];

        let byNotes: TicketRow[] = [];
        if (followupTicketIds.length) {
          let q2 = ctx.svc
            .from('tickets')
            .select(TICKET_COLS)
            .eq('tenant_id', ctx.tenantId)
            .is('deleted_at', null)
            .in('id', followupTicketIds)
            .limit(limit);
          if (status?.length) q2 = q2.in('status', status);
          if (type) q2 = q2.eq('type', type);
          if (orgId) q2 = q2.eq('organization_id', orgId);
          const { data } = await q2;
          byNotes = (data as TicketRow[] | null) ?? [];
        }

        const combined = new Map<string, TicketRow>();
        for (const t of [...((byText as TicketRow[] | null) ?? []), ...byNotes]) {
          combined.set(t.id, t);
        }
        const rows = [...combined.values()].slice(0, limit);
        return { tickets: await enrichTickets(ctx, rows), total: rows.length };
      },
    }),

    list_tickets: tool({
      description:
        'Lista tickets con filtros estructurados (sin búsqueda de texto). Úsalo para "qué casos están pendientes", "tickets de Podenza", "tickets sin asignar", "abiertos esta semana", etc.',
      inputSchema: z.object({
        status: z
          .array(z.string())
          .optional()
          .describe('Estados a incluir. Si el usuario dice "abiertos" usa ["new","assigned","in_progress","pending","testing","detenido","backlog"].'),
        type: z.string().optional(),
        urgency: z.string().optional().describe('low | medium | high | critical'),
        organization: z.string().optional().describe('Nombre o UUID del cliente.'),
        requester: z
          .string()
          .optional()
          .describe('Nombre o email del requester (cliente solicitante).'),
        assignee: z
          .string()
          .optional()
          .describe('Nombre del agente asignado, o "unassigned" para los sin asignar.'),
        date_from: z.string().optional().describe('ISO date (YYYY-MM-DD). Filtra por created_at >=.'),
        date_to: z.string().optional().describe('ISO date (YYYY-MM-DD). Filtra por created_at <=.'),
        sort: z
          .enum(['newest', 'oldest', 'urgency'])
          .optional()
          .default('newest'),
        limit: z.number().int().min(1).max(200).optional().default(50),
      }),
      execute: async ({ status, type, urgency, organization, requester, assignee, date_from, date_to, sort, limit }) => {
        let q = ctx.svc
          .from('tickets')
          .select(TICKET_COLS)
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .limit(limit);

        if (status?.length) q = q.in('status', status);
        if (type) q = q.eq('type', type);
        if (urgency) q = q.eq('urgency', urgency);

        if (organization) {
          const orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { tickets: [], total: 0, note: `No se encontró cliente "${organization}".` };
          q = q.eq('organization_id', orgId);
        }

        if (requester) {
          const esc = escapeIlike(requester);
          const { data: contacts } = await ctx.svc
            .from('contacts')
            .select('id, email')
            .eq('tenant_id', ctx.tenantId)
            .or(`name.ilike.%${esc}%,email.ilike.%${esc}%`)
            .limit(10);
          const contactIds = ((contacts as { id: string; email: string }[] | null) ?? []).map((c) => c.id);
          const emails = ((contacts as { id: string; email: string }[] | null) ?? [])
            .map((c) => c.email)
            .filter(Boolean);
          // Match by either requester_id OR requester_email (covers tickets
          // where we never linked to a contact row but the email is set).
          if (contactIds.length && emails.length) {
            q = q.or(
              `requester_id.in.(${contactIds.join(',')}),requester_email.in.(${emails.map((e) => `"${e}"`).join(',')})`,
            );
          } else if (contactIds.length) {
            q = q.in('requester_id', contactIds);
          } else if (requester.includes('@')) {
            q = q.eq('requester_email', requester);
          } else {
            return { tickets: [], total: 0, note: `No se encontró requester "${requester}".` };
          }
        }

        if (assignee) {
          const aid = await resolveAgentId(ctx, assignee);
          if (aid === 'unassigned') q = q.is('assigned_agent_id', null);
          else if (aid) q = q.eq('assigned_agent_id', aid);
          else return { tickets: [], total: 0, note: `No se encontró agente "${assignee}".` };
        }

        if (date_from) q = q.gte('created_at', date_from);
        if (date_to) q = q.lte('created_at', `${date_to}T23:59:59.999Z`);

        if (sort === 'oldest') q = q.order('created_at', { ascending: true });
        else if (sort === 'urgency') q = q.order('priority', { ascending: false }).order('created_at', { ascending: false });
        else q = q.order('created_at', { ascending: false });

        const { data, error } = await q;
        if (error) return { tickets: [], total: 0, note: error.message };
        const rows = (data as TicketRow[] | null) ?? [];
        return { tickets: await enrichTickets(ctx, rows), total: rows.length };
      },
    }),

    count_tickets: tool({
      description:
        'Cuenta tickets agrupados por una dimensión (status, type, urgency, organization, requester, assignee, day, month). Devuelve números exactos vía SQL. Úsalo para "cuántos casos abrió X", "cuántos pendientes hay", "breakdown por cliente", etc.',
      inputSchema: z.object({
        group_by: z.enum([
          'status',
          'type',
          'urgency',
          'organization',
          'requester',
          'assignee',
          'day',
          'month',
        ]),
        status: z.array(z.string()).optional(),
        type: z.string().optional(),
        urgency: z.string().optional(),
        organization: z.string().optional(),
        requester: z.string().optional(),
        assignee: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      }),
      execute: async ({ group_by, status, type, urgency, organization, requester, assignee, date_from, date_to }) => {
        // Fetch the filtered rows with just the fields we need, then group
        // in memory. For up to ~5k tickets per tenant this is fast enough
        // and avoids needing an RPC.
        let q = ctx.svc
          .from('tickets')
          .select('id, status, type, urgency, organization_id, requester_id, requester_email, assigned_agent_id, created_at')
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .limit(5000);

        if (status?.length) q = q.in('status', status);
        if (type) q = q.eq('type', type);
        if (urgency) q = q.eq('urgency', urgency);

        if (organization) {
          const orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { total: 0, groups: {}, note: `No se encontró cliente "${organization}".` };
          q = q.eq('organization_id', orgId);
        }

        if (requester) {
          const esc = escapeIlike(requester);
          const { data: contacts } = await ctx.svc
            .from('contacts')
            .select('id, email')
            .eq('tenant_id', ctx.tenantId)
            .or(`name.ilike.%${esc}%,email.ilike.%${esc}%`)
            .limit(10);
          const ids = ((contacts as { id: string; email: string }[] | null) ?? []).map((c) => c.id);
          const emails = ((contacts as { id: string; email: string }[] | null) ?? [])
            .map((c) => c.email)
            .filter(Boolean);
          if (ids.length && emails.length) {
            q = q.or(
              `requester_id.in.(${ids.join(',')}),requester_email.in.(${emails.map((e) => `"${e}"`).join(',')})`,
            );
          } else if (ids.length) {
            q = q.in('requester_id', ids);
          } else if (requester.includes('@')) {
            q = q.eq('requester_email', requester);
          } else {
            return { total: 0, groups: {}, note: `No se encontró requester "${requester}".` };
          }
        }

        if (assignee) {
          const aid = await resolveAgentId(ctx, assignee);
          if (aid === 'unassigned') q = q.is('assigned_agent_id', null);
          else if (aid) q = q.eq('assigned_agent_id', aid);
          else return { total: 0, groups: {}, note: `No se encontró agente "${assignee}".` };
        }

        if (date_from) q = q.gte('created_at', date_from);
        if (date_to) q = q.lte('created_at', `${date_to}T23:59:59.999Z`);

        const { data, error } = await q;
        if (error) return { total: 0, groups: {}, note: error.message };
        const rows = (data as Array<Record<string, string | null>>) ?? [];

        // Build lookup tables only if needed
        let orgMap = new Map<string, string>();
        let agentMap = new Map<string, string>();
        let contactMap = new Map<string, string>();
        if (group_by === 'organization') {
          const ids = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[];
          const { data: orgs } = ids.length
            ? await ctx.svc.from('organizations').select('id, name').in('id', ids)
            : { data: [] };
          orgMap = new Map((orgs as { id: string; name: string }[] ?? []).map((o) => [o.id, o.name]));
        }
        if (group_by === 'assignee') {
          const ids = [...new Set(rows.map((r) => r.assigned_agent_id).filter(Boolean))] as string[];
          const { data: ags } = ids.length
            ? await ctx.svc.from('agents').select('id, name').in('id', ids)
            : { data: [] };
          agentMap = new Map((ags as { id: string; name: string }[] ?? []).map((a) => [a.id, a.name]));
        }
        if (group_by === 'requester') {
          const ids = [...new Set(rows.map((r) => r.requester_id).filter(Boolean))] as string[];
          const { data: contacts } = ids.length
            ? await ctx.svc.from('contacts').select('id, name, email').in('id', ids)
            : { data: [] };
          contactMap = new Map(
            (contacts as { id: string; name: string; email: string }[] ?? []).map((c) => [c.id, c.name]),
          );
        }

        const groups: Record<string, number> = {};
        for (const r of rows) {
          let key = 'Unknown';
          switch (group_by) {
            case 'status':
              key = r.status ?? 'null';
              break;
            case 'type':
              key = r.type ?? 'null';
              break;
            case 'urgency':
              key = r.urgency ?? 'null';
              break;
            case 'organization':
              key = r.organization_id ? orgMap.get(r.organization_id) ?? 'Sin cliente' : 'Sin cliente';
              break;
            case 'assignee':
              key = r.assigned_agent_id ? agentMap.get(r.assigned_agent_id) ?? 'Unknown' : 'Sin asignar';
              break;
            case 'requester':
              key = r.requester_id
                ? contactMap.get(r.requester_id) ?? r.requester_email ?? 'Unknown'
                : r.requester_email ?? 'Sin requester';
              break;
            case 'day':
              key = (r.created_at ?? '').slice(0, 10);
              break;
            case 'month':
              key = (r.created_at ?? '').slice(0, 7);
              break;
          }
          groups[key] = (groups[key] ?? 0) + 1;
        }
        const sorted = Object.fromEntries(
          Object.entries(groups).sort((a, b) => b[1] - a[1]),
        );
        return { total: rows.length, groups: sorted };
      },
    }),

    get_ticket: tool({
      description:
        'Devuelve el detalle completo de un ticket: título, descripción, requester, asignado, cliente, todos los comentarios/notas, soluciones documentadas y la conversación del portal si existe. Usa ticket_number o ticket_id.',
      inputSchema: z.object({
        ticket_number: z.string().optional().describe('P.ej. "TKT-2604-00476" o "PDZ-2604-00120".'),
        ticket_id: z.string().optional().describe('UUID del ticket.'),
      }),
      execute: async ({ ticket_number, ticket_id }) => {
        if (!ticket_number && !ticket_id) {
          return { error: 'Proporciona ticket_number o ticket_id.' };
        }
        let q = ctx.svc.from('tickets').select('*').eq('tenant_id', ctx.tenantId).is('deleted_at', null);
        if (ticket_id) q = q.eq('id', ticket_id);
        else if (ticket_number) q = q.eq('ticket_number', ticket_number.toUpperCase());
        const { data: ticket } = await q.maybeSingle();
        if (!ticket) return { error: 'Ticket no encontrado.' };

        const t = ticket as Record<string, unknown>;
        const [followupsRes, solutionsRes, orgRes, agentRes, requesterRes, convRes] = await Promise.all([
          ctx.svc
            .from('ticket_followups')
            .select('content, author_type, is_private, created_at')
            .eq('ticket_id', t.id as string)
            .order('created_at', { ascending: true })
            .limit(50),
          ctx.svc
            .from('ticket_solutions')
            .select('content, status, created_at')
            .eq('ticket_id', t.id as string)
            .order('created_at', { ascending: false })
            .limit(10),
          t.organization_id
            ? ctx.svc.from('organizations').select('name').eq('id', t.organization_id as string).maybeSingle()
            : Promise.resolve({ data: null }),
          t.assigned_agent_id
            ? ctx.svc.from('agents').select('name, email').eq('id', t.assigned_agent_id as string).maybeSingle()
            : Promise.resolve({ data: null }),
          t.requester_id
            ? ctx.svc.from('contacts').select('name, email').eq('id', t.requester_id as string).maybeSingle()
            : Promise.resolve({ data: null }),
          ctx.svc.from('inbox_conversations').select('id').eq('ticket_id', t.id as string).limit(1),
        ]);

        let portalMessages: Array<{ sender: string; content: string; created_at: string }> = [];
        const convRow = ((convRes.data ?? []) as { id: string }[])[0];
        if (convRow) {
          const { data: msgs } = await ctx.svc
            .from('inbox_messages')
            .select('sender_type, content_text, created_at')
            .eq('conversation_id', convRow.id)
            .order('created_at', { ascending: true })
            .limit(30);
          portalMessages = ((msgs as Array<{ sender_type: string; content_text: string; created_at: string }> | null) ?? []).map(
            (m) => ({ sender: m.sender_type, content: m.content_text, created_at: m.created_at }),
          );
        }

        return {
          ticket_number: t.ticket_number,
          title: t.title,
          description: (t.description as string | null)?.slice(0, 2000) ?? '',
          status: t.status,
          type: t.type,
          urgency: t.urgency,
          priority: t.priority,
          channel: t.channel,
          tags: t.tags,
          organization: (orgRes.data as { name: string } | null)?.name ?? null,
          assignee: (agentRes.data as { name: string } | null)?.name ?? null,
          requester: (requesterRes.data as { name: string; email: string } | null)?.name
            ?? (t.requester_email as string | null)
            ?? null,
          requester_email: t.requester_email,
          created_at: t.created_at,
          resolved_at: t.resolved_at,
          closed_at: t.closed_at,
          sla_due_date: t.sla_due_date,
          sla_breached: t.sla_breached,
          followups: ((followupsRes.data as Array<{ content: string; author_type: string; is_private: boolean; created_at: string }> | null) ?? []).map(
            (f) => ({
              author_type: f.author_type,
              is_private: f.is_private,
              content: (f.content ?? '').slice(0, 500),
              created_at: f.created_at,
            }),
          ),
          solutions: ((solutionsRes.data as Array<{ content: string; status: string; created_at: string }> | null) ?? []).map(
            (s) => ({
              status: s.status,
              content: (s.content ?? '').slice(0, 500),
              created_at: s.created_at,
            }),
          ),
          portal_messages: portalMessages,
        };
      },
    }),

    list_requesters: tool({
      description:
        'Lista contactos/clientes (personas que reportan tickets) con su conteo de tickets. Úsalo para "quiénes son los clientes con más tickets", "dame a Daniel", etc.',
      inputSchema: z.object({
        search: z.string().optional().describe('Texto para filtrar por nombre o email.'),
        organization: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
      execute: async ({ search, organization, limit }) => {
        let q = ctx.svc
          .from('contacts')
          .select('id, name, email, phone, organization_id')
          .eq('tenant_id', ctx.tenantId)
          .limit(limit);

        if (search) {
          const esc = escapeIlike(search);
          q = q.or(`name.ilike.%${esc}%,email.ilike.%${esc}%`);
        }
        if (organization) {
          const orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { requesters: [], note: `No se encontró cliente "${organization}".` };
          q = q.eq('organization_id', orgId);
        }

        const { data: contacts } = await q;
        const list = (contacts as Array<{ id: string; name: string; email: string; phone: string | null; organization_id: string | null }> | null) ?? [];
        if (!list.length) return { requesters: [] };

        const contactIds = list.map((c) => c.id);
        const { data: tks } = await ctx.svc
          .from('tickets')
          .select('requester_id, status')
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .in('requester_id', contactIds);

        const counts = new Map<string, { open: number; closed: number; total: number }>();
        for (const t of (tks as Array<{ requester_id: string; status: string }> | null) ?? []) {
          const c = counts.get(t.requester_id) ?? { open: 0, closed: 0, total: 0 };
          c.total++;
          if (['closed', 'cancelled', 'resolved'].includes(t.status)) c.closed++;
          else c.open++;
          counts.set(t.requester_id, c);
        }

        const orgIds = [...new Set(list.map((c) => c.organization_id).filter(Boolean))] as string[];
        const { data: orgs } = orgIds.length
          ? await ctx.svc.from('organizations').select('id, name').in('id', orgIds)
          : { data: [] };
        const orgMap = new Map(
          ((orgs as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name]),
        );

        return {
          requesters: list
            .map((c) => ({
              name: c.name,
              email: c.email,
              phone: c.phone,
              organization: c.organization_id ? orgMap.get(c.organization_id) ?? null : null,
              tickets: counts.get(c.id) ?? { open: 0, closed: 0, total: 0 },
            }))
            .sort((a, b) => b.tickets.total - a.tickets.total),
        };
      },
    }),

    list_agents_workload: tool({
      description:
        'Lista los agentes TDX con su carga de trabajo: abiertos, en progreso, resueltos, cerrados. Úsalo para "cómo va Emma vs Freddy", "quién tiene más carga", "rendimiento del equipo".',
      inputSchema: z.object({
        active_only: z.boolean().optional().default(true),
      }),
      execute: async ({ active_only }) => {
        let aq = ctx.svc
          .from('agents')
          .select('id, name, email, role, is_active')
          .eq('tenant_id', ctx.tenantId)
          .in('role', ['admin', 'supervisor', 'agent']);
        if (active_only) aq = aq.eq('is_active', true);
        const { data: agents } = await aq.order('name');

        const list = (agents as Array<{ id: string; name: string; email: string; role: string; is_active: boolean }> | null) ?? [];
        if (!list.length) return { agents: [] };

        const { data: tks } = await ctx.svc
          .from('tickets')
          .select('assigned_agent_id, status')
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .in('assigned_agent_id', list.map((a) => a.id));

        const stats = new Map<string, { open: number; in_progress: number; pending: number; resolved: number; closed: number; total: number }>();
        for (const a of list) stats.set(a.id, { open: 0, in_progress: 0, pending: 0, resolved: 0, closed: 0, total: 0 });
        for (const t of (tks as Array<{ assigned_agent_id: string; status: string }> | null) ?? []) {
          const s = stats.get(t.assigned_agent_id);
          if (!s) continue;
          s.total++;
          if (t.status === 'in_progress') s.in_progress++;
          if (t.status === 'pending') s.pending++;
          if (t.status === 'resolved') s.resolved++;
          if (t.status === 'closed') s.closed++;
          if (['new', 'assigned', 'in_progress', 'pending', 'testing', 'detenido'].includes(t.status)) s.open++;
        }

        return {
          agents: list.map((a) => ({
            name: a.name,
            email: a.email,
            role: a.role,
            active: a.is_active,
            workload: stats.get(a.id) ?? { open: 0, in_progress: 0, pending: 0, resolved: 0, closed: 0, total: 0 },
          })),
        };
      },
    }),

    list_organizations: tool({
      description:
        'Lista los clientes/organizaciones con su conteo de tickets (total, abiertos, cerrados). Úsalo para "qué clientes tenemos", "stats de Prosuministros".',
      inputSchema: z.object({
        search: z.string().optional(),
      }),
      execute: async ({ search }) => {
        let q = ctx.svc
          .from('organizations')
          .select('id, name, slug, is_active')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true)
          .order('name');
        if (search) {
          const esc = escapeIlike(search);
          q = q.ilike('name', `%${esc}%`);
        }
        const { data: orgs } = await q;
        const list = (orgs as Array<{ id: string; name: string; slug: string; is_active: boolean }> | null) ?? [];
        if (!list.length) return { organizations: [] };

        const { data: tks } = await ctx.svc
          .from('tickets')
          .select('organization_id, status')
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .in('organization_id', list.map((o) => o.id));

        const counts = new Map<string, { open: number; closed: number; total: number }>();
        for (const o of list) counts.set(o.id, { open: 0, closed: 0, total: 0 });
        for (const t of (tks as Array<{ organization_id: string; status: string }> | null) ?? []) {
          const c = counts.get(t.organization_id);
          if (!c) continue;
          c.total++;
          if (['closed', 'cancelled', 'resolved'].includes(t.status)) c.closed++;
          else c.open++;
        }

        return {
          organizations: list.map((o) => ({
            name: o.name,
            slug: o.slug,
            tickets: counts.get(o.id) ?? { open: 0, closed: 0, total: 0 },
          })),
        };
      },
    }),

    search_knowledge_base: tool({
      description:
        'Busca artículos del Knowledge Base por keyword en el título y el contenido. Úsalo para "hay algún artículo sobre X", "tenemos documentación de Y".',
      inputSchema: z.object({
        query: z.string(),
        status: z.enum(['published', 'draft', 'any']).optional().default('published'),
        limit: z.number().int().min(1).max(20).optional().default(5),
      }),
      execute: async ({ query, status, limit }) => {
        const esc = escapeIlike(query);
        let q = ctx.svc
          .from('kb_articles')
          .select('title, slug, status, view_count, updated_at')
          .eq('tenant_id', ctx.tenantId)
          .or(`title.ilike.%${esc}%,content_markdown.ilike.%${esc}%`)
          .limit(limit);
        if (status !== 'any') q = q.eq('status', status);
        const { data } = await q;
        return { articles: ((data as Array<{ title: string; slug: string; status: string; view_count: number; updated_at: string }> | null) ?? []) };
      },
    }),

    get_sla_summary: tool({
      description:
        'Devuelve métricas de SLA: tickets cumplidos, en breach, % compliance. Úsalo para "cómo vamos con el SLA", "cuántos SLA vencidos tengo".',
      inputSchema: z.object({
        organization: z.string().optional(),
        period: z.enum(['today', 'week', 'month', 'all']).optional().default('month'),
      }),
      execute: async ({ organization, period }) => {
        let q = ctx.svc
          .from('tickets')
          .select('id, sla_breached, sla_due_date, status')
          .eq('tenant_id', ctx.tenantId)
          .is('deleted_at', null)
          .limit(5000);

        if (organization) {
          const orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { note: `No se encontró cliente "${organization}".` };
          q = q.eq('organization_id', orgId);
        }

        if (period !== 'all') {
          const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
          const cutoff = new Date(Date.now() - days * 86400000).toISOString();
          q = q.gte('created_at', cutoff);
        }

        const { data } = await q;
        const rows = (data as Array<{ id: string; sla_breached: boolean; sla_due_date: string | null; status: string }> | null) ?? [];
        const breached = rows.filter((r) => r.sla_breached).length;
        const met = rows.filter((r) => !r.sla_breached).length;
        const now = Date.now();
        const atRisk = rows.filter(
          (r) =>
            !r.sla_breached &&
            r.sla_due_date &&
            !['closed', 'cancelled', 'resolved'].includes(r.status) &&
            new Date(r.sla_due_date).getTime() - now < 4 * 3600 * 1000,
        ).length;
        const total = met + breached;
        return {
          period,
          total,
          met,
          breached,
          at_risk_next_4h: atRisk,
          compliance_pct: total > 0 ? Math.round((met / total) * 100) : 100,
        };
      },
    }),

    // ════════════════════════════════════════════════════════════════════
    //                         WRITE TOOLS
    // ════════════════════════════════════════════════════════════════════

    create_ticket: tool({
      description:
        'Crea un ticket nuevo. Requiere título y descripción; el resto (tipo, urgencia, cliente, requester) es opcional.',
      inputSchema: z.object({
        title: z.string().min(3),
        description: z.string().min(3),
        type: z
          .enum(['incident', 'request', 'warranty', 'support', 'backlog', 'desarrollo_pendiente'])
          .optional()
          .default('support'),
        urgency: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
        organization: z.string().optional().describe('Nombre o UUID del cliente.'),
        requester_email: z.string().optional(),
      }),
      execute: async ({ title, description, type, urgency, organization, requester_email }) => {
        let orgId: string | null = null;
        if (organization) {
          orgId = await resolveOrgId(ctx, organization);
          if (!orgId) return { success: false, error: `No se encontró cliente "${organization}".` };
        }
        const { data, error } = await ctx.svc
          .from('tickets')
          .insert({
            tenant_id: ctx.tenantId,
            title: title.slice(0, 255),
            description,
            type,
            urgency,
            status: 'new',
            channel: 'ai_agent',
            organization_id: orgId,
            requester_email: requester_email ?? null,
            created_by: ctx.userId,
          })
          .select('ticket_number, title')
          .single();
        if (error) return { success: false, error: error.message };
        const t = data as { ticket_number: string; title: string };
        return { success: true, ticket_number: t.ticket_number, title: t.title };
      },
    }),

    update_ticket: tool({
      description:
        'Actualiza campos de un ticket existente (estado, urgencia, tipo, asignado). Solo mandes los campos que quieras cambiar.',
      inputSchema: z.object({
        ticket_number: z.string(),
        status: z
          .enum(['new', 'assigned', 'in_progress', 'pending', 'detenido', 'testing', 'resolved', 'closed', 'cancelled', 'backlog'])
          .optional(),
        urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        type: z.enum(['incident', 'request', 'warranty', 'support', 'backlog', 'desarrollo_pendiente']).optional(),
        assignee: z.string().optional().describe('Nombre del agente o "unassigned".'),
      }),
      execute: async ({ ticket_number, status, urgency, type, assignee }) => {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) updates.status = status;
        if (urgency) updates.urgency = urgency;
        if (type) updates.type = type;
        if (assignee) {
          const aid = await resolveAgentId(ctx, assignee);
          if (aid === 'unassigned') updates.assigned_agent_id = null;
          else if (aid) updates.assigned_agent_id = aid;
          else return { success: false, error: `No se encontró agente "${assignee}".` };
        }
        if (status === 'resolved') updates.resolved_at = new Date().toISOString();
        if (status === 'closed') updates.closed_at = new Date().toISOString();

        const { data, error } = await ctx.svc
          .from('tickets')
          .update(updates)
          .eq('ticket_number', ticket_number.toUpperCase())
          .eq('tenant_id', ctx.tenantId)
          .select('ticket_number, status, urgency, type, assigned_agent_id')
          .maybeSingle();
        if (error) return { success: false, error: error.message };
        if (!data) return { success: false, error: 'Ticket no encontrado.' };
        return { success: true, ticket: data };
      },
    }),

    add_ticket_note: tool({
      description:
        'Agrega un comentario o nota a un ticket. Por defecto es nota interna (no visible al cliente). Si el usuario dice "respuesta pública" o "responder al cliente", pasa is_private: false.',
      inputSchema: z.object({
        ticket_number: z.string(),
        content: z.string().min(1),
        is_private: z.boolean().optional().default(true),
      }),
      execute: async ({ ticket_number, content, is_private }) => {
        const { data: t } = await ctx.svc
          .from('tickets')
          .select('id')
          .eq('ticket_number', ticket_number.toUpperCase())
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();
        if (!t) return { success: false, error: 'Ticket no encontrado.' };
        const { error } = await ctx.svc.from('ticket_followups').insert({
          tenant_id: ctx.tenantId,
          ticket_id: (t as { id: string }).id,
          content,
          is_private,
          author_id: ctx.userId,
          author_type: 'agent',
        });
        if (error) return { success: false, error: error.message };
        return { success: true, ticket_number, is_private };
      },
    }),

    resolve_ticket: tool({
      description:
        'Marca un ticket como "resolved" y registra la solución. Usa cuando el usuario diga "resuelve el ticket X" o "ya está solucionado".',
      inputSchema: z.object({
        ticket_number: z.string(),
        solution: z.string().min(3).describe('Descripción corta de la solución aplicada.'),
      }),
      execute: async ({ ticket_number, solution }) => {
        const { data: t } = await ctx.svc
          .from('tickets')
          .select('id')
          .eq('ticket_number', ticket_number.toUpperCase())
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();
        if (!t) return { success: false, error: 'Ticket no encontrado.' };
        const id = (t as { id: string }).id;
        await ctx.svc.from('ticket_solutions').insert({
          tenant_id: ctx.tenantId,
          ticket_id: id,
          content: solution,
          status: 'approved',
          proposed_by: ctx.userId,
        });
        const { error } = await ctx.svc
          .from('tickets')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true, ticket_number };
      },
    }),

    bulk_reassign: tool({
      description:
        'Reasigna en lote todos los tickets abiertos de un agente a otro. Úsalo cuando alguien se va de vacaciones o sale del equipo.',
      inputSchema: z.object({
        from_agent: z.string().describe('Nombre del agente de donde se sacan los tickets.'),
        to_agent: z.string().describe('Nombre del agente que los recibe.'),
      }),
      execute: async ({ from_agent, to_agent }) => {
        const fromId = await resolveAgentId(ctx, from_agent);
        const toId = await resolveAgentId(ctx, to_agent);
        if (!fromId || fromId === 'unassigned') return { success: false, error: `No se encontró "${from_agent}".` };
        if (!toId || toId === 'unassigned') return { success: false, error: `No se encontró "${to_agent}".` };
        const { data, error } = await ctx.svc
          .from('tickets')
          .update({ assigned_agent_id: toId, updated_at: new Date().toISOString() })
          .eq('tenant_id', ctx.tenantId)
          .eq('assigned_agent_id', fromId)
          .is('deleted_at', null)
          .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing', 'detenido'])
          .select('id');
        if (error) return { success: false, error: error.message };
        return { success: true, count: (data as { id: string }[] | null)?.length ?? 0 };
      },
    }),

    bulk_close: tool({
      description:
        'Cierra en lote tickets que estén en un estado dado (típicamente "resolved") y opcionalmente que lleven X días sin moverse.',
      inputSchema: z.object({
        from_status: z.enum(['resolved', 'pending', 'detenido']).describe('De qué estado cerrar.'),
        older_than_days: z.number().int().min(0).optional().describe('Solo los más viejos que N días.'),
      }),
      execute: async ({ from_status, older_than_days }) => {
        let q = ctx.svc
          .from('tickets')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', ctx.tenantId)
          .eq('status', from_status)
          .is('deleted_at', null);
        if (older_than_days) {
          const cutoff = new Date(Date.now() - older_than_days * 86400000).toISOString();
          q = q.lt('created_at', cutoff);
        }
        const { data, error } = await q.select('id');
        if (error) return { success: false, error: error.message };
        return { success: true, count: (data as { id: string }[] | null)?.length ?? 0 };
      },
    }),
  };

  // Wrap every tool's execute with timing + error logging so slow or
  // failing tools show up clearly in Vercel function logs.
  for (const [name, t] of Object.entries(tools)) {
    const def = t as unknown as { execute?: (input: unknown, opts: unknown) => Promise<unknown> };
    const orig = def.execute;
    if (!orig) continue;
    def.execute = async (input: unknown, opts: unknown) => {
      const t0 = Date.now();
      try {
        const out = await orig(input, opts);
        console.log(`[tool] ${name} ${Date.now() - t0}ms`);
        return out;
      } catch (err) {
        console.error(
          `[tool] ${name} FAIL ${Date.now() - t0}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    };
  }

  return tools;
}
