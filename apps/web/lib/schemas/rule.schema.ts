import { z } from 'zod';

import { requiredString, optionalString } from './common.schema';

// ---------------------------------------------------------------------------
// Rule Trigger Events
// ---------------------------------------------------------------------------
export const ruleTriggerEnum = z.enum([
  'ticket.created',
  'ticket.updated',
  'ticket.status_changed',
  'ticket.assigned',
  'ticket.sla_warning',
  'ticket.sla_breached',
  'problem.created',
  'problem.updated',
  'change.created',
  'change.updated',
  'change.approval_requested',
]);

// ---------------------------------------------------------------------------
// Condition Operators
// ---------------------------------------------------------------------------
export const conditionOperatorEnum = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
  'regex',
]);

// ---------------------------------------------------------------------------
// Rule Condition
// ---------------------------------------------------------------------------
export const ruleConditionSchema = z.object({
  field: requiredString.max(100, 'Field name must be 100 characters or fewer'),
  operator: conditionOperatorEnum,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]),
});

export type RuleConditionInput = z.infer<typeof ruleConditionSchema>;

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------
export const actionTypeEnum = z.enum([
  'set_field',
  'assign_agent',
  'assign_group',
  'add_tag',
  'remove_tag',
  'send_notification',
  'add_followup',
  'change_priority',
  'escalate',
  'webhook',
]);

// ---------------------------------------------------------------------------
// Rule Action
// ---------------------------------------------------------------------------
export const ruleActionSchema = z.object({
  action_type: actionTypeEnum,
  config: z.record(z.unknown()),
});

export type RuleActionInput = z.infer<typeof ruleActionSchema>;

// ---------------------------------------------------------------------------
// Create Rule
// ---------------------------------------------------------------------------
export const createRuleSchema = z.object({
  name: requiredString.max(100, 'Name must be 100 characters or fewer'),
  description: optionalString,
  trigger: ruleTriggerEnum,
  is_active: z.boolean().default(true),
  execution_order: z.number().int().min(0).default(0),
  stop_on_match: z.boolean().default(false),
  conditions: z.array(ruleConditionSchema).min(1, 'At least one condition is required'),
  actions: z.array(ruleActionSchema).min(1, 'At least one action is required'),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
