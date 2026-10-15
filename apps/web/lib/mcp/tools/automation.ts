// ---------------------------------------------------------------------------
// MCP Tools — Automation (workflows + rules)
// ---------------------------------------------------------------------------
// The two engines that act on tickets without a human: workflows (step
// graphs) and rules (condition → action lists).
//
// Scope design: reading automation config is harmless, but ENABLING a
// workflow or rule changes what happens to live tickets from the next event
// onward. `automation:activate` is therefore separate from
// `automation:write` — a key can draft and edit automation without ever
// being able to switch it on.
//
// Creation is always inactive, and enabling an empty workflow or an
// action-less rule is refused: it would fire on every matching event and do
// nothing, while still filling the execution logs.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  RULE_ACTION_TYPES,
  RULE_OPERATORS,
  RULE_TYPES,
  WORKFLOW_EXECUTION_STATUSES,
  WORKFLOW_TRIGGERS,
  createRule as domainCreateRule,
  createWorkflow as domainCreateWorkflow,
  getRule as domainGetRule,
  getWorkflow as domainGetWorkflow,
  listRuleExecutionLogs as domainListRuleLogs,
  listRules as domainListRules,
  listWorkflowExecutions as domainListExecutions,
  listWorkflows as domainListWorkflows,
  toggleRule as domainToggleRule,
  toggleWorkflow as domainToggleWorkflow,
  updateRule as domainUpdateRule,
  updateWorkflow as domainUpdateWorkflow,
} from '~/lib/domain/automation.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';
import { PaginationInput, buildPaginationOutput } from '../schemas';

// Enums mirrored from the database definitions, not from lib/schemas —
// rule.schema.ts disagrees with Postgres (it lists is_empty/is_not_empty,
// which the database rejects, and omits starts_with/between/is_null).
const workflowTrigger = z.enum(WORKFLOW_TRIGGERS);
const ruleType = z.enum(RULE_TYPES);
const ruleOperator = z.enum(RULE_OPERATORS);
const ruleActionType = z.enum(RULE_ACTION_TYPES);

// ---------------------------------------------------------------------------
// workflows_list
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_list',
  description:
    'List automation workflows with their trigger and active state. A workflow is a graph of steps (condition, action, delay, approval, webhook) that runs when its trigger fires.',
  scope: 'automation:read',
  inputSchema: PaginationInput.extend({
    trigger_type: workflowTrigger.optional(),
    is_active: z.boolean().optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainListWorkflows(toDomainContext(ctx), {
        trigger_type: input.trigger_type ?? null,
        is_active: input.is_active ?? null,
        search: input.search ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      workflows: result.workflows,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// workflows_get
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_get',
  description:
    'Get a workflow with its full step graph. Steps link through next_step_id, and condition steps branch to false_step_id when the condition fails.',
  scope: 'automation:read',
  inputSchema: z.object({
    workflow_id: z.string().uuid(),
    include_steps: z.boolean().default(true),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainGetWorkflow(toDomainContext(ctx), input.workflow_id, {
        includeSteps: input.include_steps,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// workflows_create
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_create',
  description:
    'Create a workflow. It is created INACTIVE and has no steps — add steps, then enable it with workflows_toggle. Workflow names are unique per tenant.',
  scope: 'automation:write',
  inputSchema: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(2000).optional(),
    trigger_type: workflowTrigger,
    trigger_config: z.record(z.unknown()).optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'write'] },
  async handler(ctx, input) {
    return {
      workflow: unwrap(
        await domainCreateWorkflow(toDomainContext(ctx), {
          name: input.name,
          description: input.description ?? null,
          trigger_type: input.trigger_type,
          trigger_config: input.trigger_config ?? null,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// workflows_update
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_update',
  description:
    'Update a workflow name, description, trigger or trigger config. Cannot enable or disable it — use workflows_toggle, which carries its own scope.',
  scope: 'automation:write',
  inputSchema: z.object({
    workflow_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    trigger_type: workflowTrigger.optional(),
    trigger_config: z.record(z.unknown()).optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'write'] },
  async handler(ctx, input) {
    const { workflow_id, ...patch } = input;
    return {
      workflow: unwrap(
        await domainUpdateWorkflow(toDomainContext(ctx), workflow_id, patch),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// workflows_toggle
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_toggle',
  description:
    'Enable or disable a workflow. ENABLING makes it act on live tickets from the next matching event onward — treat it as a production change and confirm first. Enabling a workflow with no steps is refused.',
  scope: 'automation:activate',
  inputSchema: z.object({
    workflow_id: z.string().uuid(),
    is_active: z.boolean(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'write'] },
  async handler(ctx, input) {
    return {
      workflow: unwrap(
        await domainToggleWorkflow(toDomainContext(ctx), input.workflow_id, input.is_active),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// workflows_executions
// ---------------------------------------------------------------------------

registry.register({
  name: 'workflows_executions',
  description:
    'List workflow execution history: which workflow ran, on what resource, its status and any error. Use this to find out whether an automation actually fired.',
  scope: 'automation:read',
  inputSchema: PaginationInput.extend({
    workflow_id: z.string().uuid().optional(),
    status: z.array(z.enum(WORKFLOW_EXECUTION_STATUSES)).optional(),
    trigger_resource_id: z
      .string()
      .uuid()
      .optional()
      .describe('The id of the ticket, conversation or form submission that triggered the run.'),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'workflows', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainListExecutions(toDomainContext(ctx), {
        workflow_id: input.workflow_id ?? null,
        status: input.status,
        trigger_resource_id: input.trigger_resource_id ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      executions: result.executions,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// rules_list
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_list',
  description:
    'List automation rules in evaluation order (highest priority first). A rule matches a ticket against its conditions and runs its actions; stop_on_match prevents lower-priority rules from running.',
  scope: 'automation:read',
  inputSchema: PaginationInput.extend({
    rule_type: ruleType.optional(),
    is_active: z.boolean().optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainListRules(toDomainContext(ctx), {
        rule_type: input.rule_type ?? null,
        is_active: input.is_active ?? null,
        search: input.search ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      rules: result.rules,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

// ---------------------------------------------------------------------------
// rules_get
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_get',
  description:
    'Get a rule with its conditions and actions. Conditions in the same logical_group are ANDed; separate groups are ORed. Actions run in execution_order.',
  scope: 'automation:read',
  inputSchema: z.object({ rule_id: z.string().uuid() }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainGetRule(toDomainContext(ctx), input.rule_id));
  },
});

// ---------------------------------------------------------------------------
// rules_create
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_create',
  description:
    'Create a rule with its conditions and actions in one call. Created INACTIVE — enable it with rules_toggle. At least one action is required. Rule names are unique per tenant.',
  scope: 'automation:write',
  inputSchema: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(2000).optional(),
    rule_type: ruleType,
    priority: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .default(0)
      .describe('Higher runs first.'),
    stop_on_match: z
      .boolean()
      .default(false)
      .describe('When true, no lower-priority rule runs after this one matches.'),
    conditions: z
      .array(
        z.object({
          field: z.string().trim().min(1).max(100),
          operator: ruleOperator,
          // rule_conditions.value is jsonb NOT NULL, so this cannot be
          // optional. z.unknown() alone would make the key optional and
          // let a condition through with no value at all.
          value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.null()]),
          logical_group: z.number().int().min(0).default(0),
        }),
      )
      .default([]),
    actions: z
      .array(
        z.object({
          action_type: ruleActionType,
          config: z.record(z.unknown()).default({}),
          execution_order: z.number().int().min(0).optional(),
        }),
      )
      .min(1),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainCreateRule(toDomainContext(ctx), {
        name: input.name,
        description: input.description ?? null,
        rule_type: input.rule_type,
        priority: input.priority,
        stop_on_match: input.stop_on_match,
        conditions: input.conditions,
        actions: input.actions,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// rules_update
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_update',
  description:
    'Update a rule name, description, type, priority or stop_on_match. Conditions and actions are not edited here. Cannot enable or disable it — use rules_toggle.',
  scope: 'automation:write',
  inputSchema: z.object({
    rule_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    rule_type: ruleType.optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    stop_on_match: z.boolean().optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'write'] },
  async handler(ctx, input) {
    const { rule_id, ...patch } = input;
    return { rule: unwrap(await domainUpdateRule(toDomainContext(ctx), rule_id, patch)) };
  },
});

// ---------------------------------------------------------------------------
// rules_toggle
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_toggle',
  description:
    'Enable or disable a rule. ENABLING makes it evaluate every matching event and act on live tickets — treat it as a production change. Enabling a rule with no actions is refused.',
  scope: 'automation:activate',
  inputSchema: z.object({
    rule_id: z.string().uuid(),
    is_active: z.boolean(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'write'] },
  async handler(ctx, input) {
    return {
      rule: unwrap(await domainToggleRule(toDomainContext(ctx), input.rule_id, input.is_active)),
    };
  },
});

// ---------------------------------------------------------------------------
// rules_execution_logs
// ---------------------------------------------------------------------------

registry.register({
  name: 'rules_execution_logs',
  description:
    'Rule evaluation history, including evaluations that did NOT match. Filter by matched: false to answer "why did this rule not fire on that ticket" — the question automation debugging usually starts from.',
  scope: 'automation:read',
  inputSchema: PaginationInput.extend({
    rule_id: z.string().uuid().optional(),
    ticket_id: z.string().uuid().optional(),
    matched: z.boolean().optional(),
  }),
  meta: { since: '1.3.0', tags: ['automation', 'rules', 'read'] },
  async handler(ctx, input) {
    const result = unwrap(
      await domainListRuleLogs(toDomainContext(ctx), {
        rule_id: input.rule_id ?? null,
        ticket_id: input.ticket_id ?? null,
        matched: input.matched ?? null,
        page: input.page,
        limit: input.limit,
      }),
    );
    return {
      logs: result.logs,
      pagination: buildPaginationOutput(input, result.total),
    };
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __automationToolsLoaded = true;
