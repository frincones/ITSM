// ---------------------------------------------------------------------------
// MCP Tools — Satisfaction, portal activity, projects, notifications, search
// ---------------------------------------------------------------------------
// The customer-facing edge of the system plus the delivery work beside
// tickets.
//
// Two measurement honesty notes, both verified against production:
//
//   - 1 of 188 NPS surveys has been answered. nps_summary therefore always
//     reports the response rate next to the score and refuses to present a
//     tiny sample as a result.
//   - search_global (the database RPC) resolves its tenant from the session
//     and returns nothing for an API-key caller, so search is implemented in
//     the domain against the caller's real tenant instead.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  PROJECT_STATUSES,
  PROJECT_TASK_STATUSES,
  addProjectTask as domainAddTask,
  getNpsSummary as domainNpsSummary,
  getProject as domainGetProject,
  listNotificationTemplates as domainTemplates,
  listNotifications as domainNotifications,
  listPortalActivity as domainPortalActivity,
  listProjects as domainListProjects,
  listSurveys as domainListSurveys,
  searchEverything as domainSearch,
  updateProjectTask as domainUpdateTask,
} from '~/lib/domain/engagement.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';
import { PaginationInput, buildPaginationOutput } from '../schemas';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Satisfaction
// ---------------------------------------------------------------------------

registry.register({
  name: 'nps_summary',
  description:
    'Net Promoter Score with its response rate. ALWAYS read response_rate_pct and interpretation before quoting the score: a survey programme where almost nobody answered produces a number that looks like a measurement and is not one. Promoters score 9-10, passives 7-8, detractors 0-6.',
  scope: 'nps:read',
  inputSchema: z.object({
    organization_id: z.string().uuid().optional(),
    since: z.string().datetime().optional(),
  }),
  meta: { since: '1.9.0', tags: ['nps', 'reports', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainNpsSummary(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
        since: input.since ?? null,
      }),
    );
  },
});

registry.register({
  name: 'nps_list_surveys',
  description:
    'Individual satisfaction surveys with their score and comment. Use responded_only: true to see just the answers — the comments are where the useful signal is. Survey tokens are never returned.',
  scope: 'nps:read',
  inputSchema: PaginationInput.extend({
    organization_id: z.string().uuid().optional(),
    agent_id: z.string().uuid().optional(),
    responded_only: z.boolean().default(false),
    since: z.string().datetime().optional(),
  }),
  meta: { since: '1.9.0', tags: ['nps', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainListSurveys(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
        agent_id: input.agent_id ?? null,
        responded_only: input.responded_only,
        since: input.since ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      surveys: result.surveys,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// Portal activity
// ---------------------------------------------------------------------------

registry.register({
  name: 'portal_activity',
  description:
    'What clients actually do in their portal: pages opened, tickets viewed, chats started. Use it to tell whether a client is using the portal before concluding they are unhappy with it. IP addresses and user agents are not returned.',
  scope: 'portal:read',
  inputSchema: PaginationInput.extend({
    organization_id: z.string().uuid().optional(),
    event_type: z.string().trim().max(100).optional(),
    since: z.string().datetime().optional(),
  }),
  meta: { since: '1.9.0', tags: ['portal', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainPortalActivity(toDomainContext(ctx), {
        organization_id: input.organization_id ?? null,
        event_type: input.event_type ?? null,
        since: input.since ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      events: result.events,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

registry.register({
  name: 'projects_list',
  description:
    'Delivery projects with status, dates, budget and progress. Projects are longer-running work that sits beside tickets rather than inside them.',
  scope: 'projects:read',
  inputSchema: z.object({
    status: z.array(z.enum(PROJECT_STATUSES)).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.9.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListProjects(toDomainContext(ctx), {
        status: input.status,
        search: input.search ?? null,
      }),
    );
  },
});

registry.register({
  name: 'projects_get',
  description:
    'A project with its tasks, members and a task summary. computed_progress_pct is derived from completed tasks and can disagree with the project progress_percent field, which is maintained by hand — when they differ, the computed one reflects reality.',
  scope: 'projects:read',
  inputSchema: z.object({ project_id: z.string().uuid() }),
  meta: { since: '1.9.0', tags: ['projects', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainGetProject(toDomainContext(ctx), input.project_id));
  },
});

registry.register({
  name: 'projects_add_task',
  description:
    'Add a task to a project. Pass parent_task_id to nest it under another task. Starts in todo.',
  scope: 'projects:write',
  inputSchema: z.object({
    project_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional(),
    assigned_to: z.string().uuid().optional(),
    start_date: dateOnly.optional(),
    due_date: dateOnly.optional(),
    estimated_hours: z.number().min(0).max(10_000).optional(),
    parent_task_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.9.0', tags: ['projects', 'write'] },
  async handler(ctx, input) {
    const { project_id, ...fields } = input;
    return { task: unwrap(await domainAddTask(toDomainContext(ctx), project_id, fields)) };
  },
});

registry.register({
  name: 'projects_update_task',
  description:
    'Update a project task: status (todo, in_progress, done), assignment, dates or hours. Recording actual_hours against estimated_hours is what makes future estimates better.',
  scope: 'projects:write',
  inputSchema: z.object({
    task_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: z.enum(PROJECT_TASK_STATUSES).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    start_date: dateOnly.nullable().optional(),
    due_date: dateOnly.nullable().optional(),
    estimated_hours: z.number().min(0).max(10_000).nullable().optional(),
    actual_hours: z.number().min(0).max(10_000).nullable().optional(),
  }),
  meta: { since: '1.9.0', tags: ['projects', 'write'] },
  async handler(ctx, input) {
    const { task_id, ...patch } = input;
    return { task: unwrap(await domainUpdateTask(toDomainContext(ctx), task_id, patch)) };
  },
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

registry.register({
  name: 'notifications_list',
  description:
    'In-app notifications the system has produced, newest first. Filter by user_id to see what one person was told, or unread_only to find what has gone unseen.',
  scope: 'notifications:read',
  inputSchema: PaginationInput.extend({
    user_id: z.string().uuid().optional(),
    unread_only: z.boolean().default(false),
  }),
  meta: { since: '1.9.0', tags: ['notifications', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainNotifications(toDomainContext(ctx), {
        user_id: input.user_id ?? null,
        unread_only: input.unread_only,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      notifications: result.notifications,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

registry.register({
  name: 'notifications_templates',
  description:
    'The configured notification templates: which event sends on which channel, in which language, and whether it is active. Use it to explain why an event did or did not reach someone. Body templates are omitted; subjects are included.',
  scope: 'notifications:read',
  // A tool whose inputSchema has no properties serializes to
  // `{type:"object",properties:{}}`, which fails Anthropic's tool-schema
  // validation and makes the model drop the WHOLE server catalog — the same
  // failure the ZodEffects case in json-schema.ts exists to avoid. The
  // filters below are genuinely useful, and they also keep the schema
  // non-empty.
  inputSchema: z.object({
    event_type: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe('Only templates for this event, e.g. ticket_created.'),
    active_only: z.boolean().default(false),
  }),
  meta: { since: '1.9.0', tags: ['notifications', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainTemplates(toDomainContext(ctx), {
        eventType: input.event_type ?? null,
        activeOnly: input.active_only,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

registry.register({
  name: 'search_everything',
  description:
    'Search tickets, knowledge base articles, contacts and organizations in one call. Returns a typed result list with a link for each hit. Use it when you have a name or a phrase but not an id.',
  scope: 'search:read',
  inputSchema: z.object({
    query: z.string().trim().min(2).max(200),
    limit: z.number().int().min(1).max(25).default(5).describe('Per entity type.'),
    types: z
      .array(z.enum(['tickets', 'kb', 'contacts', 'organizations']))
      .optional()
      .describe('Defaults to all four.'),
  }),
  meta: { since: '1.9.0', tags: ['search', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainSearch(toDomainContext(ctx), input.query, {
        limit: input.limit,
        types: input.types,
      }),
    );
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __engagementToolsLoaded = true;
