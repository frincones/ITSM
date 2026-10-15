// ---------------------------------------------------------------------------
// Domain layer — portal engagement, satisfaction, projects and search
// ---------------------------------------------------------------------------
// The customer-facing edge of the system plus the delivery work that sits
// beside tickets:
//
//   nps_surveys           satisfaction scores and their comments
//   portal_activity_log   what clients actually do in the portal
//   projects              longer-running delivery work
//   notifications         what the system has told people
//
// Note on global search: the database has a `search_global` RPC, but it
// resolves the tenant through get_current_tenant_id(), which reads the
// session. An API-key caller has no session, so the function returns zero
// rows for every query — verified against production. Search is therefore
// implemented here against the tenant the caller actually carries, rather
// than wrapping a function that cannot work on this path.
// ---------------------------------------------------------------------------

import 'server-only';

import { fail, ok, resolveOrgScope, type DomainContext, type DomainResult } from './types';

/** projects.status CHECK constraint. */
export const PROJECT_STATUSES = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** project_tasks.status CHECK constraint. */
export const PROJECT_TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Satisfaction (NPS / CSAT)
// ---------------------------------------------------------------------------

export interface NpsFilters {
  organization_id?: string | null;
  agent_id?: string | null;
  responded_only?: boolean;
  since?: string | null;
  page: number;
  limit: number;
}

/**
 * Raw survey rows.
 *
 * `token` is excluded: it is the credential that lets someone answer a
 * survey without logging in.
 */
export async function listSurveys(
  ctx: DomainContext,
  filters: NpsFilters,
): Promise<DomainResult<{ surveys: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('nps_surveys')
    .select(
      'id, ticket_id, organization_id, agent_id, recipient_email, score, category, comment, sent_at, responded_at, expires_at, created_at',
      { count: 'exact' },
    )
    .eq('tenant_id', actor.tenantId);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) query = query.in('organization_id', orgScope);
  if (filters.agent_id) query = query.eq('agent_id', filters.agent_id);
  if (filters.responded_only) query = query.not('responded_at', 'is', null);
  if (filters.since) query = query.gte('created_at', filters.since);

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ surveys: data ?? [], total: count ?? 0 });
}

/**
 * NPS score with its response rate.
 *
 * The response rate is reported alongside deliberately: measured on
 * production, 1 of 188 surveys has been answered. An NPS computed from a
 * single response is not a measurement, and a caller that only sees the
 * score would report it as one.
 */
export async function getNpsSummary(
  ctx: DomainContext,
  filters: { organization_id?: string | null; since?: string | null } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  let query = client
    .from('nps_surveys')
    .select('score, category, responded_at, organization_id')
    .eq('tenant_id', actor.tenantId)
    .limit(5000);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) query = query.in('organization_id', orgScope);
  if (filters.since) query = query.gte('created_at', filters.since);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');

  const rows = (data ?? []) as Array<{ score: number | null; responded_at: string | null }>;
  const answered = rows.filter((r) => r.responded_at !== null && r.score !== null);

  // NPS: promoters (9-10) minus detractors (0-6), as a percentage.
  const promoters = answered.filter((r) => (r.score as number) >= 9).length;
  const passives = answered.filter((r) => (r.score as number) >= 7 && (r.score as number) <= 8).length;
  const detractors = answered.filter((r) => (r.score as number) <= 6).length;
  const nps = answered.length
    ? Math.round(((promoters - detractors) / answered.length) * 100)
    : null;

  const responseRate = rows.length
    ? Math.round((answered.length / rows.length) * 1000) / 10
    : 0;

  return ok({
    surveys_sent: rows.length,
    responses: answered.length,
    response_rate_pct: responseRate,
    nps,
    promoters,
    passives,
    detractors,
    average_score: answered.length
      ? Math.round((answered.reduce((s, r) => s + (r.score as number), 0) / answered.length) * 10) / 10
      : null,
    interpretation:
      answered.length === 0
        ? 'No survey has been answered, so there is no NPS to report.'
        : answered.length < 10
          ? `Only ${answered.length} response(s) out of ${rows.length} surveys sent (${responseRate}%). That is too small a sample to report as an NPS figure.`
          : `Based on ${answered.length} responses out of ${rows.length} surveys sent (${responseRate}%).`,
  });
}

// ---------------------------------------------------------------------------
// Portal activity
// ---------------------------------------------------------------------------

export async function listPortalActivity(
  ctx: DomainContext,
  filters: {
    organization_id?: string | null;
    event_type?: string | null;
    since?: string | null;
    page: number;
    limit: number;
  },
): Promise<DomainResult<{ events: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('portal_activity_log')
    // ip_address and user_agent are omitted: they identify individuals and
    // are not needed to understand how the portal is being used.
    .select(
      'id, organization_id, session_id, user_email, user_name, event_type, event_data, page_url, conversation_id, created_at',
      { count: 'exact' },
    )
    .eq('tenant_id', actor.tenantId);

  const orgScope = resolveOrgScope(
    actor,
    filters.organization_id ? [filters.organization_id] : null,
  );
  if (orgScope) query = query.in('organization_id', orgScope);
  if (filters.event_type) query = query.eq('event_type', filters.event_type);
  if (filters.since) query = query.gte('created_at', filters.since);

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ events: data ?? [], total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const PROJECT_COLUMNS =
  'id, name, description, status, start_date, end_date, project_manager_id, budget, actual_cost, progress_percent, created_at, updated_at';

export async function listProjects(
  ctx: DomainContext,
  filters: { status?: ProjectStatus[]; search?: string | null } = {},
): Promise<DomainResult<{ projects: unknown[] }>> {
  const { actor, client } = ctx;

  let query = client
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('tenant_id', actor.tenantId)
    .order('created_at', { ascending: false });

  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.search) {
    query = query.ilike('name', `%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');
  return ok({ projects: data ?? [] });
}

export async function getProject(
  ctx: DomainContext,
  projectId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: project } = await client
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', projectId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!project) return fail('Project not found', 'not_found');

  const [{ data: tasks }, { data: members }] = await Promise.all([
    client
      .from('project_tasks')
      .select('*')
      .eq('tenant_id', actor.tenantId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true }),
    // project_members carries no tenant_id; it inherits isolation from the
    // parent project, which was already scoped above.
    client.from('project_members').select('*').eq('project_id', projectId),
  ]);

  const taskRows = (tasks ?? []) as Array<{ status: string }>;
  const done = taskRows.filter((t) => t.status === 'done').length;

  return ok({
    project,
    tasks: tasks ?? [],
    members: members ?? [],
    task_summary: {
      total: taskRows.length,
      done,
      in_progress: taskRows.filter((t) => t.status === 'in_progress').length,
      todo: taskRows.filter((t) => t.status === 'todo').length,
      // Derived from tasks, which can disagree with projects.progress_percent
      // when that field is maintained by hand.
      computed_progress_pct: taskRows.length ? Math.round((done / taskRows.length) * 100) : null,
    },
  });
}

export interface ProjectTaskFields {
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  parent_task_id?: string | null;
}

export async function addProjectTask(
  ctx: DomainContext,
  projectId: string,
  fields: ProjectTaskFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: project } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (!project) return fail('Project not found', 'not_found');

  const { data, error } = await client
    .from('project_tasks')
    .insert({
      tenant_id: actor.tenantId,
      project_id: projectId,
      title: fields.title,
      description: fields.description ?? null,
      assigned_to: fields.assigned_to ?? null,
      start_date: fields.start_date ?? null,
      due_date: fields.due_date ?? null,
      estimated_hours: fields.estimated_hours ?? null,
      parent_task_id: fields.parent_task_id ?? null,
      status: 'todo',
    })
    .select('*')
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

export async function updateProjectTask(
  ctx: DomainContext,
  taskId: string,
  patch: Partial<ProjectTaskFields> & { status?: ProjectTaskStatus; actual_hours?: number | null },
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'title',
    'description',
    'assigned_to',
    'start_date',
    'due_date',
    'estimated_hours',
    'actual_hours',
    'status',
  ] as const) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }
  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('project_tasks')
    .update(payload)
    .eq('id', taskId)
    .eq('tenant_id', actor.tenantId)
    .select('*')
    .maybeSingle();

  if (error) return fail(error.message, 'internal');
  if (!data) return fail('Project task not found', 'not_found');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function listNotifications(
  ctx: DomainContext,
  filters: { user_id?: string | null; unread_only?: boolean; page: number; limit: number },
): Promise<DomainResult<{ notifications: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('notifications')
    .select('id, user_id, type, title, body, link, is_read, resource_type, resource_id, created_at', {
      count: 'exact',
    })
    .eq('tenant_id', actor.tenantId);

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.unread_only) query = query.eq('is_read', false);

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ notifications: data ?? [], total: count ?? 0 });
}

export async function listNotificationTemplates(
  ctx: DomainContext,
  filters: { eventType?: string | null; activeOnly?: boolean } = {},
): Promise<DomainResult<{ templates: unknown[] }>> {
  let query = ctx.client
    .from('notification_templates')
    // body_template is omitted: it is long, and the subject plus the event
    // is what answers "why did this reach someone".
    .select('id, event_type, channel, subject_template, is_active, language, created_at, updated_at')
    .eq('tenant_id', ctx.actor.tenantId)
    .order('event_type', { ascending: true });

  if (filters.eventType) query = query.eq('event_type', filters.eventType);
  if (filters.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return fail(error.message, 'internal');
  return ok({ templates: data ?? [] });
}

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

export interface SearchResult {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

/**
 * Searches tickets, knowledge base articles, contacts and organizations.
 *
 * Implemented here rather than through the search_global RPC: that function
 * resolves the tenant via get_current_tenant_id(), which reads the session,
 * so it returns nothing at all for an API-key caller.
 */
export async function searchEverything(
  ctx: DomainContext,
  query: string,
  options: { limit?: number; types?: string[] } = {},
): Promise<DomainResult<{ results: SearchResult[]; query: string }>> {
  const { actor, client } = ctx;
  const limit = options.limit ?? 5;
  const want = new Set(options.types?.length ? options.types : ['tickets', 'kb', 'contacts', 'organizations']);
  const term = `%${query.replace(/[%_]/g, '\\$&')}%`;
  const orgScope = resolveOrgScope(actor);
  const results: SearchResult[] = [];

  if (want.has('tickets')) {
    let q = client
      .from('tickets')
      .select('id, ticket_number, title, status, organization_id')
      .eq('tenant_id', actor.tenantId)
      .is('deleted_at', null)
      .or(`title.ilike.${term},description.ilike.${term}`)
      .limit(limit);
    if (orgScope) q = q.in('organization_id', orgScope);
    const { data } = await q;
    for (const t of (data ?? []) as Array<{ id: string; ticket_number: string; title: string; status: string }>) {
      results.push({
        entity_type: 'ticket',
        entity_id: t.id,
        title: `${t.ticket_number} — ${t.title}`,
        subtitle: t.status,
        url: `/home/tickets/${t.id}`,
      });
    }
  }

  if (want.has('kb')) {
    let q = client
      .from('kb_articles')
      .select('id, title, slug, status, organization_id')
      .eq('tenant_id', actor.tenantId)
      .is('deleted_at', null)
      .or(`title.ilike.${term},content_markdown.ilike.${term}`)
      .limit(limit);
    if (orgScope) {
      q = q.or(`organization_id.in.(${orgScope.join(',')}),organization_id.is.null`);
    }
    const { data } = await q;
    for (const a of (data ?? []) as Array<{ id: string; title: string; status: string }>) {
      results.push({
        entity_type: 'kb_article',
        entity_id: a.id,
        title: a.title,
        subtitle: a.status,
        url: `/home/kb/${a.id}`,
      });
    }
  }

  if (want.has('contacts')) {
    let q = client
      .from('contacts')
      .select('id, name, email, company, organization_id')
      .eq('tenant_id', actor.tenantId)
      .or(`name.ilike.${term},email.ilike.${term},company.ilike.${term}`)
      .limit(limit);
    if (orgScope) q = q.in('organization_id', orgScope);
    const { data } = await q;
    for (const c of (data ?? []) as Array<{ id: string; name: string; email: string | null }>) {
      results.push({
        entity_type: 'contact',
        entity_id: c.id,
        title: c.name,
        subtitle: c.email,
        url: `/home/settings/organizations`,
      });
    }
  }

  if (want.has('organizations')) {
    let q = client
      .from('organizations')
      .select('id, name, slug, industry')
      .eq('tenant_id', actor.tenantId)
      .ilike('name', term)
      .limit(limit);
    if (orgScope) q = q.in('id', orgScope);
    const { data } = await q;
    for (const o of (data ?? []) as Array<{ id: string; name: string; industry: string | null }>) {
      results.push({
        entity_type: 'organization',
        entity_id: o.id,
        title: o.name,
        subtitle: o.industry,
        url: `/home/settings/organizations/${o.id}`,
      });
    }
  }

  return ok({ results, query });
}
