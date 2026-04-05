import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/* -------------------------------------------------------------------------- */
/*  POST /api/ai/assistant — AI Assistant with Tool Calling (Streaming)        */
/* -------------------------------------------------------------------------- */

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  const client = getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, name, role')
    .eq('user_id', user.id)
    .single();

  if (!agent) return new Response('Agent not found', { status: 403 });

  const { messages } = await req.json();
  const svc = getSvc();
  const tenantId = agent.tenant_id;

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: `You are NovaDesk AI Assistant — an advanced ITSM copilot for ${agent.name} (${agent.role}).
You help manage tickets, problems, changes, knowledge base, and all ITSM operations.
You speak in Spanish by default. Be concise, professional, and action-oriented.
When executing actions, confirm what you did with the result.
When listing data, format it clearly with ticket numbers and key details.
Tenant ID: ${tenantId}. Agent ID: ${agent.id}.
You have full access to all ITSM operations via tools.`,
    messages,
    tools: {
      // ── SEARCH & QUERY ──────────────────────────────────────────
      searchTickets: tool({
        description: 'Search tickets by status, type, urgency, organization, category, or text query',
        parameters: z.object({
          status: z.string().optional().describe('Filter by status: new, assigned, in_progress, pending, testing, resolved, closed'),
          type: z.string().optional().describe('Filter by type: incident, request, warranty, support, backlog'),
          urgency: z.string().optional().describe('Filter by urgency: low, medium, high, critical'),
          organization_name: z.string().optional().describe('Filter by organization name'),
          category_name: z.string().optional().describe('Filter by category name'),
          query: z.string().optional().describe('Text search in title'),
          limit: z.number().optional().default(10),
        }),
        execute: async (params) => {
          let q = svc.from('tickets')
            .select('id, ticket_number, title, status, type, urgency, created_at, assigned_agent_id, organization_id, requester_email')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(params.limit ?? 10);

          if (params.status) q = q.eq('status', params.status);
          if (params.type) q = q.eq('type', params.type);
          if (params.urgency) q = q.eq('urgency', params.urgency);
          if (params.query) q = q.ilike('title', `%${params.query}%`);

          const { data } = await q;
          return { tickets: data ?? [], count: data?.length ?? 0 };
        },
      }),

      getTicketDetail: tool({
        description: 'Get full details of a specific ticket by ticket_number or ID',
        parameters: z.object({
          ticket_number: z.string().optional(),
          ticket_id: z.string().optional(),
        }),
        execute: async ({ ticket_number, ticket_id }) => {
          let q = svc.from('tickets').select('*').eq('tenant_id', tenantId);
          if (ticket_number) q = q.eq('ticket_number', ticket_number);
          else if (ticket_id) q = q.eq('id', ticket_id);
          else return { error: 'Provide ticket_number or ticket_id' };

          const { data } = await q.single();
          if (!data) return { error: 'Ticket not found' };

          const { data: followups } = await svc.from('ticket_followups')
            .select('content, author_type, is_private, created_at')
            .eq('ticket_id', data.id)
            .order('created_at', { ascending: true });

          return { ticket: data, followups: followups ?? [] };
        },
      }),

      // ── TICKET ACTIONS ──────────────────────────────────────────
      changeTicketStatus: tool({
        description: 'Change the status of a ticket',
        parameters: z.object({
          ticket_number: z.string().describe('Ticket number like PDZ-2601-00005'),
          new_status: z.string().describe('new, assigned, in_progress, pending, testing, resolved, closed, cancelled'),
        }),
        execute: async ({ ticket_number, new_status }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('id, status').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          const { error } = await svc.from('tickets')
            .update({ status: new_status, updated_at: new Date().toISOString() })
            .eq('id', ticket.id);

          return error ? { error: error.message } : { success: true, from: ticket.status, to: new_status };
        },
      }),

      assignTicket: tool({
        description: 'Assign a ticket to an agent by name',
        parameters: z.object({
          ticket_number: z.string(),
          agent_name: z.string().describe('Name of the agent to assign'),
        }),
        execute: async ({ ticket_number, agent_name }) => {
          const { data: targetAgent } = await svc.from('agents')
            .select('id, name').eq('tenant_id', tenantId).ilike('name', `%${agent_name}%`).limit(1).single();
          if (!targetAgent) return { error: `Agent "${agent_name}" not found` };

          const { error } = await svc.from('tickets')
            .update({ assigned_agent_id: targetAgent.id, status: 'assigned', updated_at: new Date().toISOString() })
            .eq('ticket_number', ticket_number).eq('tenant_id', tenantId);

          return error ? { error: error.message } : { success: true, assigned_to: targetAgent.name };
        },
      }),

      addFollowup: tool({
        description: 'Add a comment/followup to a ticket (public or internal note)',
        parameters: z.object({
          ticket_number: z.string(),
          content: z.string().describe('The comment text'),
          is_private: z.boolean().optional().default(true).describe('true for internal note, false for public reply'),
        }),
        execute: async ({ ticket_number, content, is_private }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('id').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          const { error } = await svc.from('ticket_followups').insert({
            tenant_id: tenantId,
            ticket_id: ticket.id,
            content,
            is_private: is_private ?? true,
            author_id: user.id,
            author_type: 'agent',
          });

          return error ? { error: error.message } : { success: true };
        },
      }),

      createTicket: tool({
        description: 'Create a new ticket',
        parameters: z.object({
          title: z.string(),
          description: z.string(),
          type: z.enum(['incident', 'request', 'warranty', 'support', 'backlog']).default('support'),
          urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
          organization_name: z.string().optional(),
        }),
        execute: async ({ title, description, type, urgency, organization_name }) => {
          let orgId = null;
          if (organization_name) {
            const { data: org } = await svc.from('organizations')
              .select('id').eq('tenant_id', tenantId).ilike('name', `%${organization_name}%`).limit(1).single();
            orgId = org?.id ?? null;
          }

          const { data, error } = await svc.from('tickets').insert({
            tenant_id: tenantId,
            title, description, type, urgency,
            status: 'new', channel: 'ai_agent',
            organization_id: orgId,
            created_by: user.id,
          }).select('id, ticket_number, title').single();

          return error ? { error: error.message } : { success: true, ticket: data };
        },
      }),

      resolveTicket: tool({
        description: 'Add a solution and resolve a ticket',
        parameters: z.object({
          ticket_number: z.string(),
          solution: z.string().describe('The solution description'),
        }),
        execute: async ({ ticket_number, solution }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('id').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          await svc.from('ticket_solutions').insert({
            tenant_id: tenantId, ticket_id: ticket.id,
            content: solution, status: 'approved', proposed_by: user.id,
          });

          const { error } = await svc.from('tickets')
            .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', ticket.id);

          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── REPORTS & ANALYTICS ─────────────────────────────────────
      getMetrics: tool({
        description: 'Get ticket metrics summary: counts by status, type, agent workload',
        parameters: z.object({
          organization_name: z.string().optional(),
        }),
        execute: async ({ organization_name }) => {
          let q = svc.from('tickets')
            .select('status, type, urgency, assigned_agent_id')
            .eq('tenant_id', tenantId).is('deleted_at', null);

          if (organization_name) {
            const { data: org } = await svc.from('organizations')
              .select('id').eq('tenant_id', tenantId).ilike('name', `%${organization_name}%`).limit(1).single();
            if (org) q = q.eq('organization_id', org.id);
          }

          const { data } = await q;
          const tickets = data ?? [];

          const byStatus: Record<string, number> = {};
          const byType: Record<string, number> = {};
          tickets.forEach((t: any) => {
            byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
            byType[t.type] = (byType[t.type] ?? 0) + 1;
          });

          return { total: tickets.length, byStatus, byType };
        },
      }),

      listAgents: tool({
        description: 'List all agents with their current workload',
        parameters: z.object({}),
        execute: async () => {
          const { data: agents } = await svc.from('agents')
            .select('id, name, email, role').eq('tenant_id', tenantId);

          const { data: tickets } = await svc.from('tickets')
            .select('assigned_agent_id').eq('tenant_id', tenantId)
            .is('deleted_at', null).in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']);

          const workload: Record<string, number> = {};
          (tickets ?? []).forEach((t: any) => {
            if (t.assigned_agent_id) workload[t.assigned_agent_id] = (workload[t.assigned_agent_id] ?? 0) + 1;
          });

          return (agents ?? []).map((a: any) => ({
            ...a, open_tickets: workload[a.id] ?? 0,
          }));
        },
      }),

      // ── KB ──────────────────────────────────────────────────────
      searchKB: tool({
        description: 'Search knowledge base articles',
        parameters: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          const { data } = await svc.from('kb_articles')
            .select('id, title, slug, status')
            .eq('tenant_id', tenantId)
            .ilike('title', `%${query}%`)
            .limit(5);
          return { articles: data ?? [] };
        },
      }),

      createKBArticle: tool({
        description: 'Create a knowledge base article',
        parameters: z.object({
          title: z.string(),
          content: z.string(),
          slug: z.string().optional(),
        }),
        execute: async ({ title, content, slug }) => {
          const autoSlug = slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
          const { data, error } = await svc.from('kb_articles').insert({
            tenant_id: tenantId, title, content_markdown: content,
            slug: autoSlug, status: 'draft', author_id: agent.id,
          }).select('id, title, slug').single();

          return error ? { error: error.message } : { success: true, article: data };
        },
      }),

      // ── BULK OPERATIONS ─────────────────────────────────────────
      bulkChangeStatus: tool({
        description: 'Change status of multiple tickets matching criteria',
        parameters: z.object({
          current_status: z.string().describe('Current status to filter'),
          new_status: z.string().describe('New status to set'),
          older_than_days: z.number().optional().describe('Only tickets older than N days'),
          organization_name: z.string().optional(),
        }),
        execute: async ({ current_status, new_status, older_than_days, organization_name }) => {
          let q = svc.from('tickets')
            .update({ status: new_status, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('status', current_status).is('deleted_at', null);

          if (older_than_days) {
            const cutoff = new Date(Date.now() - older_than_days * 86400000).toISOString();
            q = q.lt('created_at', cutoff);
          }
          if (organization_name) {
            const { data: org } = await svc.from('organizations')
              .select('id').eq('tenant_id', tenantId).ilike('name', `%${organization_name}%`).limit(1).single();
            if (org) q = q.eq('organization_id', org.id);
          }

          const { count, error } = await q.select('id', { count: 'exact', head: false });
          return error ? { error: error.message } : { success: true, updated: count ?? 0 };
        },
      }),

      bulkAssign: tool({
        description: 'Reassign all tickets from one agent to another',
        parameters: z.object({
          from_agent_name: z.string(),
          to_agent_name: z.string(),
        }),
        execute: async ({ from_agent_name, to_agent_name }) => {
          const { data: fromAgent } = await svc.from('agents')
            .select('id').eq('tenant_id', tenantId).ilike('name', `%${from_agent_name}%`).limit(1).single();
          const { data: toAgent } = await svc.from('agents')
            .select('id').eq('tenant_id', tenantId).ilike('name', `%${to_agent_name}%`).limit(1).single();

          if (!fromAgent || !toAgent) return { error: 'Agent not found' };

          const { count, error } = await svc.from('tickets')
            .update({ assigned_agent_id: toAgent.id, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('assigned_agent_id', fromAgent.id)
            .is('deleted_at', null).in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
            .select('id', { count: 'exact', head: false });

          return error ? { error: error.message } : { success: true, reassigned: count ?? 0 };
        },
      }),

      // ── DAILY SUMMARY ───────────────────────────────────────────
      getDailySummary: tool({
        description: 'Get a summary of today\'s activity',
        parameters: z.object({}),
        execute: async () => {
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

          const [created, resolved, pending] = await Promise.all([
            svc.from('tickets').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()),
            svc.from('tickets').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).gte('resolved_at', todayStart.toISOString()),
            svc.from('tickets').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).eq('status', 'pending').is('deleted_at', null),
          ]);

          return {
            created_today: created.count ?? 0,
            resolved_today: resolved.count ?? 0,
            total_pending: pending.count ?? 0,
          };
        },
      }),

      // ── TICKET EXTENDED ─────────────────────────────────────────
      updateTicket: tool({
        description: 'Update ticket fields (title, description, type, urgency, tags)',
        parameters: z.object({
          ticket_number: z.string(),
          title: z.string().optional(),
          description: z.string().optional(),
          type: z.string().optional(),
          urgency: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
        execute: async ({ ticket_number, ...fields }) => {
          const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (fields.title) update.title = fields.title;
          if (fields.description) update.description = fields.description;
          if (fields.type) update.type = fields.type;
          if (fields.urgency) update.urgency = fields.urgency;
          if (fields.tags) update.tags = fields.tags;

          const { error } = await svc.from('tickets')
            .update(update).eq('ticket_number', ticket_number).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      addTask: tool({
        description: 'Create a task within a ticket',
        parameters: z.object({
          ticket_number: z.string(),
          title: z.string(),
          description: z.string().optional(),
          assigned_agent_name: z.string().optional(),
        }),
        execute: async ({ ticket_number, title, description, assigned_agent_name }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('id').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          let assignedId = null;
          if (assigned_agent_name) {
            const { data: a } = await svc.from('agents')
              .select('id').eq('tenant_id', tenantId).ilike('name', `%${assigned_agent_name}%`).limit(1).single();
            assignedId = a?.id ?? null;
          }

          const { error } = await svc.from('ticket_tasks').insert({
            tenant_id: tenantId, ticket_id: ticket.id, title,
            description: description ?? '', assigned_agent_id: assignedId, status: 'pending',
          });
          return error ? { error: error.message } : { success: true };
        },
      }),

      deleteTicket: tool({
        description: 'Soft-delete a ticket',
        parameters: z.object({ ticket_number: z.string() }),
        execute: async ({ ticket_number }) => {
          const { error } = await svc.from('tickets')
            .update({ deleted_at: new Date().toISOString() })
            .eq('ticket_number', ticket_number).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── PROBLEMS ────────────────────────────────────────────────
      createProblem: tool({
        description: 'Create a new problem record',
        parameters: z.object({
          title: z.string(),
          description: z.string(),
          urgency: z.string().optional().default('medium'),
        }),
        execute: async ({ title, description, urgency }) => {
          const num = `PRB-${Date.now().toString(36).toUpperCase()}`;
          const { data, error } = await svc.from('problems').insert({
            tenant_id: tenantId, problem_number: num, title, description,
            status: 'new', urgency, created_by: user.id,
          }).select('id, problem_number, title').single();
          return error ? { error: error.message } : { success: true, problem: data };
        },
      }),

      changeProblemStatus: tool({
        description: 'Change problem status',
        parameters: z.object({
          problem_number: z.string(),
          new_status: z.string().describe('new, accepted, analysis, root_cause_identified, solution_planned, resolved, closed'),
        }),
        execute: async ({ problem_number, new_status }) => {
          const { error } = await svc.from('problems')
            .update({ status: new_status, updated_at: new Date().toISOString() })
            .eq('problem_number', problem_number).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      linkTicketToProblem: tool({
        description: 'Link a ticket to a problem',
        parameters: z.object({
          ticket_number: z.string(),
          problem_number: z.string(),
        }),
        execute: async ({ ticket_number, problem_number }) => {
          const { data: ticket } = await svc.from('tickets').select('id').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          const { data: problem } = await svc.from('problems').select('id').eq('problem_number', problem_number).eq('tenant_id', tenantId).single();
          if (!ticket || !problem) return { error: 'Ticket or problem not found' };

          const { error } = await svc.from('problem_ticket_links').insert({
            tenant_id: tenantId, problem_id: problem.id, ticket_id: ticket.id,
          });
          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── CHANGES ─────────────────────────────────────────────────
      createChange: tool({
        description: 'Create a change request',
        parameters: z.object({
          title: z.string(),
          description: z.string(),
          change_type: z.string().optional().default('normal'),
          scheduled_start: z.string().optional(),
        }),
        execute: async ({ title, description, change_type, scheduled_start }) => {
          const num = `CHG-${Date.now().toString(36).toUpperCase()}`;
          const { data, error } = await svc.from('changes').insert({
            tenant_id: tenantId, change_number: num, title, description,
            change_type, status: 'new', created_by: user.id,
            scheduled_start: scheduled_start ?? null,
          }).select('id, change_number, title').single();
          return error ? { error: error.message } : { success: true, change: data };
        },
      }),

      changeChangeStatus: tool({
        description: 'Change status of a change request',
        parameters: z.object({
          change_number: z.string(),
          new_status: z.string().describe('new, evaluation, approval_pending, approved, rejected, scheduled, in_progress, testing, implemented, rolled_back, closed'),
        }),
        execute: async ({ change_number, new_status }) => {
          const { error } = await svc.from('changes')
            .update({ status: new_status, updated_at: new Date().toISOString() })
            .eq('change_number', change_number).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── INBOX ───────────────────────────────────────────────────
      listConversations: tool({
        description: 'List recent inbox conversations',
        parameters: z.object({ status: z.string().optional().default('open'), limit: z.number().optional().default(10) }),
        execute: async ({ status, limit }) => {
          const { data } = await svc.from('inbox_conversations')
            .select('id, subject, status, last_message_at, metadata')
            .eq('tenant_id', tenantId).eq('status', status ?? 'open')
            .order('last_message_at', { ascending: false }).limit(limit ?? 10);
          return { conversations: data ?? [] };
        },
      }),

      resolveConversation: tool({
        description: 'Resolve an inbox conversation',
        parameters: z.object({ conversation_id: z.string() }),
        execute: async ({ conversation_id }) => {
          const { error } = await svc.from('inbox_conversations')
            .update({ status: 'resolved', updated_at: new Date().toISOString() })
            .eq('id', conversation_id).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── KB EXTENDED ─────────────────────────────────────────────
      updateArticle: tool({
        description: 'Update a KB article content',
        parameters: z.object({ slug: z.string(), title: z.string().optional(), content: z.string().optional() }),
        execute: async ({ slug, title, content }) => {
          const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (title) update.title = title;
          if (content) update.content_markdown = content;

          const { error } = await svc.from('kb_articles')
            .update(update).eq('slug', slug).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      publishArticle: tool({
        description: 'Publish a KB article',
        parameters: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { error } = await svc.from('kb_articles')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('slug', slug).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      archiveArticle: tool({
        description: 'Archive a KB article',
        parameters: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { error } = await svc.from('kb_articles')
            .update({ status: 'archived' }).eq('slug', slug).eq('tenant_id', tenantId);
          return error ? { error: error.message } : { success: true };
        },
      }),

      // ── ADMIN ───────────────────────────────────────────────────
      createCategory: tool({
        description: 'Create a new ticket category',
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          const { data, error } = await svc.from('categories').insert({
            tenant_id: tenantId, name,
          }).select('id, name').single();
          return error ? { error: error.message } : { success: true, category: data };
        },
      }),

      listOrganizations: tool({
        description: 'List all organizations with ticket counts',
        parameters: z.object({}),
        execute: async () => {
          const { data: orgs } = await svc.from('organizations')
            .select('id, name, slug, is_active, portal_token')
            .eq('tenant_id', tenantId).order('name');
          return { organizations: orgs ?? [] };
        },
      }),

      // ── REPORTS ─────────────────────────────────────────────────
      getAgentPerformance: tool({
        description: 'Get performance metrics for a specific agent or all agents',
        parameters: z.object({ agent_name: z.string().optional() }),
        execute: async ({ agent_name }) => {
          let q = svc.from('tickets')
            .select('assigned_agent_id, status, type, created_at, resolved_at')
            .eq('tenant_id', tenantId).is('deleted_at', null)
            .not('assigned_agent_id', 'is', null);

          if (agent_name) {
            const { data: a } = await svc.from('agents')
              .select('id').eq('tenant_id', tenantId).ilike('name', `%${agent_name}%`).limit(1).single();
            if (a) q = q.eq('assigned_agent_id', a.id);
          }

          const { data } = await q;
          const tickets = data ?? [];
          const agentStats: Record<string, { assigned: number; resolved: number }> = {};
          tickets.forEach((t: any) => {
            const aid = t.assigned_agent_id;
            if (!agentStats[aid]) agentStats[aid] = { assigned: 0, resolved: 0 };
            agentStats[aid]!.assigned++;
            if (['resolved', 'closed'].includes(t.status)) agentStats[aid]!.resolved++;
          });

          const { data: agents } = await svc.from('agents').select('id, name').eq('tenant_id', tenantId);
          const nameMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));

          return Object.entries(agentStats).map(([id, s]) => ({
            agent: nameMap.get(id) ?? 'Unknown', ...s,
            resolution_rate: s.assigned > 0 ? `${Math.round((s.resolved / s.assigned) * 100)}%` : '0%',
          }));
        },
      }),

      getSLACompliance: tool({
        description: 'Get SLA compliance rate',
        parameters: z.object({ days: z.number().optional().default(30) }),
        execute: async ({ days }) => {
          const since = new Date(Date.now() - (days ?? 30) * 86400000).toISOString();
          const [met, breached] = await Promise.all([
            svc.from('tickets').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).gte('created_at', since).eq('sla_breached', false),
            svc.from('tickets').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).gte('created_at', since).eq('sla_breached', true),
          ]);
          const total = (met.count ?? 0) + (breached.count ?? 0);
          return {
            compliance: total > 0 ? `${Math.round(((met.count ?? 0) / total) * 100)}%` : 'N/A',
            met: met.count ?? 0, breached: breached.count ?? 0, total,
          };
        },
      }),

      // ── AI ANALYTICS ────────────────────────────────────────────
      classifyTicket: tool({
        description: 'AI-classify a ticket (type, urgency, category suggestion)',
        parameters: z.object({ ticket_number: z.string() }),
        execute: async ({ ticket_number }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('id, title, description').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          const { generateText } = await import('ai');
          const result = await generateText({
            model: openai('gpt-4o-mini'),
            system: 'Classify this ITSM ticket. Return JSON: { "type": "incident|request|warranty|support|backlog", "urgency": "low|medium|high|critical", "category": "suggested category" }',
            prompt: `Title: ${ticket.title}\nDescription: ${ticket.description ?? ''}`,
            temperature: 0,
          });

          try {
            const classification = JSON.parse(result.text.replace(/```json\s*|\s*```/g, '').trim());
            await svc.from('tickets').update({
              ai_classification: classification, ai_classified_at: new Date().toISOString(),
            }).eq('id', ticket.id);
            return { success: true, classification };
          } catch { return { raw: result.text }; }
        },
      }),

      summarizeTicket: tool({
        description: 'AI-summarize a ticket with its full history',
        parameters: z.object({ ticket_number: z.string() }),
        execute: async ({ ticket_number }) => {
          const { data: ticket } = await svc.from('tickets')
            .select('*').eq('ticket_number', ticket_number).eq('tenant_id', tenantId).single();
          if (!ticket) return { error: 'Ticket not found' };

          const { data: followups } = await svc.from('ticket_followups')
            .select('content, author_type, created_at').eq('ticket_id', ticket.id).order('created_at');

          const { generateText } = await import('ai');
          const result = await generateText({
            model: openai('gpt-4o-mini'),
            system: 'Summarize this ITSM ticket concisely in Spanish. Include: issue, actions taken, current status, next steps.',
            prompt: `Ticket: ${ticket.title}\nDescription: ${ticket.description}\nStatus: ${ticket.status}\nType: ${ticket.type}\n\nFollowups:\n${(followups ?? []).map((f: any) => `[${f.author_type}] ${f.content}`).join('\n')}`,
            temperature: 0.2,
          });

          return { summary: result.text };
        },
      }),

      analyzePatterns: tool({
        description: 'Analyze patterns in recent tickets using AI',
        parameters: z.object({ days: z.number().optional().default(7) }),
        execute: async ({ days }) => {
          const since = new Date(Date.now() - (days ?? 7) * 86400000).toISOString();
          const { data } = await svc.from('tickets')
            .select('title, type, urgency, status, category_id')
            .eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', since);

          const { generateText } = await import('ai');
          const result = await generateText({
            model: openai('gpt-4o-mini'),
            system: 'Analyze these ITSM tickets and identify patterns, anomalies, and recommendations. Be specific with numbers. Respond in Spanish.',
            prompt: `${(data ?? []).length} tickets in last ${days} days:\n${(data ?? []).map((t: any) => `- [${t.type}/${t.urgency}/${t.status}] ${t.title}`).join('\n')}`,
            temperature: 0.3,
          });

          return { analysis: result.text, ticket_count: (data ?? []).length };
        },
      }),
    },
    maxSteps: 5,
    temperature: 0.3,
  });

  return result.toDataStreamResponse();
}
