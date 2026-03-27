import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enums (mirror PostgreSQL types)
// ---------------------------------------------------------------------------
export const problemStatusEnum = z.enum([
  'new',
  'accepted',
  'analysis',
  'root_cause_identified',
  'solution_planned',
  'resolved',
  'closed',
]);

export const severityLevelEnum = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

// ---------------------------------------------------------------------------
// Create Problem
// ---------------------------------------------------------------------------
export const createProblemSchema = z.object({
  title: requiredString.max(255, 'Title must be 255 characters or fewer'),
  description: optionalString,
  urgency: severityLevelEnum.default('medium'),
  impact: severityLevelEnum.default('medium'),
  category_id: optionalUuid,
  assigned_agent_id: optionalUuid,
  assigned_group_id: optionalUuid,
  root_cause: optionalString,
  workaround: optionalString,
});

export type CreateProblemInput = z.infer<typeof createProblemSchema>;

// ---------------------------------------------------------------------------
// Update Problem
// ---------------------------------------------------------------------------
export const updateProblemSchema = createProblemSchema.partial().extend({
  status: problemStatusEnum.optional(),
  root_cause: optionalString,
  root_cause_ai: optionalString,
  workaround: optionalString,
  solution: optionalString,
});

export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

// ---------------------------------------------------------------------------
// Link Ticket to Problem
// ---------------------------------------------------------------------------
export const linkTicketSchema = z.object({
  problem_id: uuidSchema,
  ticket_id: uuidSchema,
});

export type LinkTicketInput = z.infer<typeof linkTicketSchema>;
