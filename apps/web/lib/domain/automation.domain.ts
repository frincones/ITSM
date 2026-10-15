// ---------------------------------------------------------------------------
// Domain layer — automation (workflows + rules)
// ---------------------------------------------------------------------------
// Two related engines:
//
//   workflows — a graph of steps (condition / action / delay / approval…)
//               triggered by an event, executed by workflow.service.ts
//   rules     — flat condition → action lists evaluated by rules.service.ts
//
// Both decide what happens to real tickets, so activating a misconfigured one
// has production consequences. That is why `is_active` is only ever changed
// through an explicit toggle, never as a side effect of an update, and why
// the MCP tools that flip it carry their own scope.
//
// Enum note: the Zod schemas in lib/schemas/rule.schema.ts DO NOT match the
// Postgres enums. `conditionOperatorEnum` there lists `is_empty` and
// `is_not_empty`, which the database rejects:
//
//     invalid input value for enum rule_operator: "is_empty"
//
// and omits `starts_with`, `ends_with`, `is_null`, `is_not_null`, `between`.
// This file declares the operators from the database definition, verified
// against production. Do not swap them back for the Zod ones.
// ---------------------------------------------------------------------------

import 'server-only';

// Automation is tenant-wide: workflows and rules are not scoped per
// organization, so there is no org filter to apply here.
import {
  asJson,
  fail,
  type Json,
  ok,
  type DomainContext,
  type DomainResult,
} from './types';

// ---------------------------------------------------------------------------
// Enums — mirrored from the Postgres definitions (00010, 00011)
// ---------------------------------------------------------------------------

/** workflows.trigger_type CHECK constraint. */
export const WORKFLOW_TRIGGERS = [
  'ticket_created',
  'ticket_updated',
  'ticket_status_changed',
  'sla_warning',
  'sla_breach',
  'message_received',
  'scheduled',
  'manual',
  'webhook',
  'form_submitted',
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

/** workflow_steps.step_type CHECK constraint. */
export const WORKFLOW_STEP_TYPES = [
  'condition',
  'action',
  'delay',
  'loop',
  'parallel',
  'ai_decision',
  'human_approval',
  'webhook',
  'sub_workflow',
] as const;
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

/** workflow_executions.status CHECK constraint. */
export const WORKFLOW_EXECUTION_STATUSES = [
  'running',
  'completed',
  'failed',
  'cancelled',
  'waiting',
] as const;

/** rule_type enum. */
export const RULE_TYPES = [
  'on_create',
  'on_update',
  'on_schedule',
  'on_sla_breach',
  'on_escalation',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/** rule_operator enum — from the database, NOT from rule.schema.ts. */
export const RULE_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
  'between',
  'regex',
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

/** rule_action_type enum. */
export const RULE_ACTION_TYPES = [
  'assign_agent',
  'assign_group',
  'set_priority',
  'set_status',
  'set_category',
  'set_type',
  'add_tag',
  'remove_tag',
  'send_notification',
  'send_webhook',
  'add_follower',
  'escalate',
  'set_sla',
  'add_note',
  'run_ai_triage',
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

// ---------------------------------------------------------------------------
// Column sets
// ---------------------------------------------------------------------------

const WORKFLOW_COLUMNS =
  'id, name, description, trigger_type, trigger_config, is_active, version, created_at, updated_at';

const RULE_COLUMNS =
  'id, name, description, rule_type, is_active, priority, stop_on_match, created_by, created_at, updated_at';

// ---------------------------------------------------------------------------
// Workflows — read
// ---------------------------------------------------------------------------

export interface ListWorkflowsFilters {
  trigger_type?: string | null;
  is_active?: boolean | null;
  search?: string | null;
  page: number;
  limit: number;
}

export async function listWorkflows(
  ctx: DomainContext,
  filters: ListWorkflowsFilters,
): Promise<DomainResult<{ workflows: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('workflows')
    .select(WORKFLOW_COLUMNS, { count: 'exact' })
    .eq('tenant_id', actor.tenantId);

  if (filters.trigger_type) query = query.eq('trigger_type', filters.trigger_type);
  if (filters.is_active !== null && filters.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters.search) {
    query = query.ilike('name', `%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  }

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ workflows: data ?? [], total: count ?? 0 });
}

export async function getWorkflow(
  ctx: DomainContext,
  workflowId: string,
  options: { includeSteps?: boolean } = {},
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;
  const { includeSteps = true } = options;

  const { data: workflow } = await client
    .from('workflows')
    .select(WORKFLOW_COLUMNS)
    .eq('id', workflowId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!workflow) return fail('Workflow not found', 'not_found');

  const result: Record<string, unknown> = { workflow };

  if (includeSteps) {
    // workflow_steps carries no tenant_id of its own; it inherits isolation
    // from the parent workflow, which we have already scoped above.
    const { data: steps } = await client
      .from('workflow_steps')
      .select(
        'id, step_type, name, config, position_x, position_y, next_step_id, false_step_id, created_at',
      )
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: true });
    result.steps = steps ?? [];
  }

  return ok(result);
}

// ---------------------------------------------------------------------------
// Workflows — write
// ---------------------------------------------------------------------------

export interface WorkflowFields {
  name: string;
  description?: string | null;
  trigger_type: WorkflowTrigger;
  trigger_config?: Record<string, unknown> | null;
}

/**
 * Creates a workflow. Always inactive on creation — a workflow begins acting
 * on real tickets the moment it is enabled, and that must be a separate,
 * deliberate decision (see toggleWorkflow).
 */
export async function createWorkflow(
  ctx: DomainContext,
  fields: WorkflowFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data, error } = await client
    .from('workflows')
    .insert({
      tenant_id: actor.tenantId,
      name: fields.name,
      description: fields.description ?? null,
      trigger_type: fields.trigger_type,
      trigger_config: asJson(fields.trigger_config ?? {}),
      is_active: false,
      version: 1,
    })
    .select(WORKFLOW_COLUMNS)
    .single();

  if (error) {
    // UNIQUE(tenant_id, name) — report the collision rather than a raw
    // Postgres error, so a caller can retry with a different name.
    if (error.code === '23505') {
      return fail(`A workflow named '${fields.name}' already exists`, 'conflict');
    }
    return fail(error.message, 'internal');
  }

  return ok(data as Record<string, unknown>);
}

export async function updateWorkflow(
  ctx: DomainContext,
  workflowId: string,
  patch: Partial<WorkflowFields>,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.trigger_type !== undefined) payload.trigger_type = patch.trigger_type;
  if (patch.trigger_config !== undefined) payload.trigger_config = patch.trigger_config;

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  // `is_active` is deliberately not patchable here: enabling automation is a
  // separate operation with its own scope.
  const { data, error } = await client
    .from('workflows')
    .update(payload)
    .eq('id', workflowId)
    .eq('tenant_id', actor.tenantId)
    .select(WORKFLOW_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return fail(`A workflow named '${patch.name}' already exists`, 'conflict');
    }
    return fail(error.message, 'internal');
  }
  if (!data) return fail('Workflow not found', 'not_found');
  return ok(data as Record<string, unknown>);
}

/**
 * Enables or disables a workflow.
 *
 * Enabling one makes it act on live tickets from the next matching event, so
 * this refuses to enable a workflow with no steps — an empty workflow would
 * fire, do nothing, and still record executions.
 */
export async function toggleWorkflow(
  ctx: DomainContext,
  workflowId: string,
  isActive: boolean,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: existing } = await client
    .from('workflows')
    .select('id, name, is_active')
    .eq('id', workflowId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!existing) return fail('Workflow not found', 'not_found');

  if (isActive) {
    const { count } = await client
      .from('workflow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId);

    if (!count) {
      return fail(
        `Workflow '${existing.name}' has no steps, so enabling it would fire on every matching event and do nothing. Add steps first.`,
        'invalid_input',
      );
    }
  }

  const { data, error } = await client
    .from('workflows')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', workflowId)
    .eq('tenant_id', actor.tenantId)
    .select(WORKFLOW_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Workflow executions — read only
// ---------------------------------------------------------------------------

export interface ListExecutionsFilters {
  workflow_id?: string | null;
  status?: string[];
  /**
   * The resource that triggered the run. workflow_executions records this
   * as a (type, id) pair rather than a ticket FK, because a workflow can be
   * triggered by a ticket, a conversation or a form submission.
   */
  trigger_resource_id?: string | null;
  page: number;
  limit: number;
}

export async function listWorkflowExecutions(
  ctx: DomainContext,
  filters: ListExecutionsFilters,
): Promise<DomainResult<{ executions: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('workflow_executions')
    .select('*', { count: 'exact' })
    .eq('tenant_id', actor.tenantId);

  if (filters.workflow_id) query = query.eq('workflow_id', filters.workflow_id);
  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.trigger_resource_id) {
    query = query.eq('trigger_resource_id', filters.trigger_resource_id);
  }

  const from = (filters.page - 1) * filters.limit;
  // This table has no created_at; started_at is its timeline column.
  const { data, error, count } = await query
    .order('started_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ executions: data ?? [], total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// Rules — read
// ---------------------------------------------------------------------------

export interface ListRulesFilters {
  rule_type?: RuleType | null;
  is_active?: boolean | null;
  search?: string | null;
  page: number;
  limit: number;
}

export async function listRules(
  ctx: DomainContext,
  filters: ListRulesFilters,
): Promise<DomainResult<{ rules: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('rules')
    .select(RULE_COLUMNS, { count: 'exact' })
    .eq('tenant_id', actor.tenantId);

  if (filters.rule_type) query = query.eq('rule_type', filters.rule_type);
  if (filters.is_active !== null && filters.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters.search) {
    query = query.ilike('name', `%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  }

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    // Rules are evaluated by priority, so list them in execution order.
    .order('priority', { ascending: false })
    .order('name', { ascending: true })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ rules: data ?? [], total: count ?? 0 });
}

export async function getRule(
  ctx: DomainContext,
  ruleId: string,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: rule } = await client
    .from('rules')
    .select(RULE_COLUMNS)
    .eq('id', ruleId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!rule) return fail('Rule not found', 'not_found');

  const [{ data: conditions }, { data: actions }] = await Promise.all([
    client
      .from('rule_conditions')
      .select('id, field, operator, value, logical_group, created_at')
      .eq('rule_id', ruleId)
      .eq('tenant_id', actor.tenantId)
      .order('logical_group', { ascending: true }),
    client
      .from('rule_actions')
      .select('id, action_type, config, execution_order, created_at')
      .eq('rule_id', ruleId)
      .eq('tenant_id', actor.tenantId)
      .order('execution_order', { ascending: true }),
  ]);

  return ok({ rule, conditions: conditions ?? [], actions: actions ?? [] });
}

// ---------------------------------------------------------------------------
// Rules — write
// ---------------------------------------------------------------------------

export interface RuleConditionInput {
  field: string;
  operator: RuleOperator;
  value: unknown;
  logical_group?: number;
}

export interface RuleActionInput {
  action_type: RuleActionType;
  config?: Record<string, unknown>;
  execution_order?: number;
}

export interface RuleFields {
  name: string;
  description?: string | null;
  rule_type: RuleType;
  priority?: number;
  stop_on_match?: boolean;
  conditions?: RuleConditionInput[];
  actions?: RuleActionInput[];
}

/**
 * Creates a rule with its conditions and actions.
 *
 * Inactive on creation, same reasoning as workflows. A rule with no actions
 * is rejected: it would evaluate on every event and produce nothing.
 *
 * There is no transaction across the three inserts (PostgREST does not give
 * us one), so a partial failure is cleaned up explicitly rather than left
 * behind as an orphan rule.
 */
export async function createRule(
  ctx: DomainContext,
  fields: RuleFields,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  if (!fields.actions?.length) {
    return fail(
      'A rule needs at least one action, otherwise it evaluates on every event and does nothing',
      'invalid_input',
    );
  }

  const { data: rule, error } = await client
    .from('rules')
    .insert({
      tenant_id: actor.tenantId,
      name: fields.name,
      description: fields.description ?? null,
      rule_type: fields.rule_type,
      priority: fields.priority ?? 0,
      stop_on_match: fields.stop_on_match ?? false,
      is_active: false,
      created_by: actor.userId,
    })
    .select(RULE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(`A rule named '${fields.name}' already exists`, 'conflict');
    }
    return fail(error.message, 'internal');
  }

  const ruleId = (rule as { id: string }).id;

  if (fields.conditions?.length) {
    const { error: condError } = await client.from('rule_conditions').insert(
      fields.conditions.map((c) => ({
        tenant_id: actor.tenantId,
        rule_id: ruleId,
        field: c.field,
        operator: c.operator,
        value: c.value as Json,
        logical_group: c.logical_group ?? 0,
      })),
    );
    if (condError) {
      await client.from('rules').delete().eq('id', ruleId).eq('tenant_id', actor.tenantId);
      return fail(`Conditions rejected, rule not created: ${condError.message}`, 'invalid_input');
    }
  }

  const { error: actError } = await client.from('rule_actions').insert(
    fields.actions.map((a, i) => ({
      tenant_id: actor.tenantId,
      rule_id: ruleId,
      action_type: a.action_type,
      config: asJson(a.config ?? {}),
      execution_order: a.execution_order ?? i,
    })),
  );
  if (actError) {
    await client.from('rule_conditions').delete().eq('rule_id', ruleId).eq('tenant_id', actor.tenantId);
    await client.from('rules').delete().eq('id', ruleId).eq('tenant_id', actor.tenantId);
    return fail(`Actions rejected, rule not created: ${actError.message}`, 'invalid_input');
  }

  return getRule(ctx, ruleId);
}

export async function updateRule(
  ctx: DomainContext,
  ruleId: string,
  patch: Partial<Omit<RuleFields, 'conditions' | 'actions'>>,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.rule_type !== undefined) payload.rule_type = patch.rule_type;
  if (patch.priority !== undefined) payload.priority = patch.priority;
  if (patch.stop_on_match !== undefined) payload.stop_on_match = patch.stop_on_match;

  if (Object.keys(payload).length === 1) {
    return fail('Provide at least one field to update', 'invalid_input');
  }

  const { data, error } = await client
    .from('rules')
    .update(payload)
    .eq('id', ruleId)
    .eq('tenant_id', actor.tenantId)
    .select(RULE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return fail(`A rule named '${patch.name}' already exists`, 'conflict');
    }
    return fail(error.message, 'internal');
  }
  if (!data) return fail('Rule not found', 'not_found');
  return ok(data as Record<string, unknown>);
}

export async function toggleRule(
  ctx: DomainContext,
  ruleId: string,
  isActive: boolean,
): Promise<DomainResult<Record<string, unknown>>> {
  const { actor, client } = ctx;

  const { data: existing } = await client
    .from('rules')
    .select('id, name')
    .eq('id', ruleId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();

  if (!existing) return fail('Rule not found', 'not_found');

  if (isActive) {
    const { count } = await client
      .from('rule_actions')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', ruleId)
      .eq('tenant_id', actor.tenantId);

    if (!count) {
      return fail(
        `Rule '${existing.name}' has no actions, so enabling it would do nothing on every matching event. Add actions first.`,
        'invalid_input',
      );
    }
  }

  const { data, error } = await client
    .from('rules')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', ruleId)
    .eq('tenant_id', actor.tenantId)
    .select(RULE_COLUMNS)
    .single();

  if (error) return fail(error.message, 'internal');
  return ok(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Rule execution logs — read only
// ---------------------------------------------------------------------------

export interface ListRuleLogsFilters {
  rule_id?: string | null;
  ticket_id?: string | null;
  matched?: boolean | null;
  page: number;
  limit: number;
}

/**
 * Execution history for rules. This is the tool that answers "why did this
 * rule not fire on that ticket" — the question automation debugging
 * actually starts from.
 */
export async function listRuleExecutionLogs(
  ctx: DomainContext,
  filters: ListRuleLogsFilters,
): Promise<DomainResult<{ logs: unknown[]; total: number }>> {
  const { actor, client } = ctx;

  let query = client
    .from('rule_execution_logs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', actor.tenantId);

  if (filters.rule_id) query = query.eq('rule_id', filters.rule_id);
  if (filters.ticket_id) query = query.eq('ticket_id', filters.ticket_id);
  if (filters.matched !== null && filters.matched !== undefined) {
    query = query.eq('matched', filters.matched);
  }

  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + filters.limit - 1);

  if (error) return fail(error.message, 'internal');
  return ok({ logs: data ?? [], total: count ?? 0 });
}
