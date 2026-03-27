import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
} from './common.schema';

// ---------------------------------------------------------------------------
// Workflow Trigger Types
// ---------------------------------------------------------------------------
export const workflowTriggerEnum = z.enum([
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
  'contact.created',
  'form.submitted',
  'manual',
]);

// ---------------------------------------------------------------------------
// Step Types
// ---------------------------------------------------------------------------
export const workflowStepTypeEnum = z.enum([
  'condition',
  'action',
  'delay',
  'ai_decision',
  'human_approval',
  'webhook',
]);

// ---------------------------------------------------------------------------
// Action Types (within action steps)
// ---------------------------------------------------------------------------
export const workflowActionTypeEnum = z.enum([
  'set_field',
  'assign_agent',
  'assign_group',
  'send_notification',
  'add_tag',
  'trigger_webhook',
]);

// ---------------------------------------------------------------------------
// Condition Operators
// ---------------------------------------------------------------------------
export const workflowConditionOperatorEnum = z.enum([
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
// Workflow Step Schema
// ---------------------------------------------------------------------------
export const workflowStepSchema = z.object({
  step_order: z.number().int().min(0),
  name: requiredString.max(100, 'Step name must be 100 characters or fewer'),
  type: workflowStepTypeEnum,
  config: z.record(z.unknown()).default({}),
  next_step_id: optionalUuid,
  false_step_id: optionalUuid,
});

export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;

// ---------------------------------------------------------------------------
// Create Workflow
// ---------------------------------------------------------------------------
export const createWorkflowSchema = z.object({
  name: requiredString.max(150, 'Name must be 150 characters or fewer'),
  description: optionalString,
  trigger_type: workflowTriggerEnum,
  trigger_config: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().default(false),
  steps: z.array(workflowStepSchema).min(1, 'At least one step is required'),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

// ---------------------------------------------------------------------------
// Update Workflow
// ---------------------------------------------------------------------------
export const updateWorkflowSchema = createWorkflowSchema.partial();

export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
