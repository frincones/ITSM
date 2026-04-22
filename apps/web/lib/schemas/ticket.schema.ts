import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
  optionalEmail,
  paginationSchema,
  dateRangeSchema,
  sortSchema,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enums (mirror PostgreSQL types)
// ---------------------------------------------------------------------------
export const ticketTypeEnum = z.enum([
  'incident',
  'request',
  'warranty',
  'support',
  'backlog',
  'desarrollo_pendiente',
]);

export const ticketStatusEnum = z.enum([
  'new',
  'backlog',
  'assigned',
  'in_progress',
  'pending',
  'detenido',
  'testing',
  'resolved',
  'reopened',
  'closed',
  'cancelled',
]);

export const severityLevelEnum = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

// ---------------------------------------------------------------------------
// Create Ticket
// ---------------------------------------------------------------------------
export const createTicketSchema = z.object({
  title: requiredString.max(255, 'Title must be 255 characters or fewer'),
  description: requiredString.max(10_000, 'Description must be 10 000 characters or fewer'),
  type: ticketTypeEnum.default('incident'),
  urgency: severityLevelEnum.default('medium'),
  impact: severityLevelEnum.default('medium'),
  organization_id: optionalUuid,
  category_id: optionalUuid,
  requester_id: optionalUuid,
  requester_email: optionalEmail,
  tags: z.array(z.string().trim().min(1)).optional().default([]),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// ---------------------------------------------------------------------------
// Update Ticket
// ---------------------------------------------------------------------------
export const updateTicketSchema = createTicketSchema.partial().extend({
  status: ticketStatusEnum.optional(),
  assigned_agent_id: optionalUuid,
  assigned_group_id: optionalUuid,
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// ---------------------------------------------------------------------------
// Filter Tickets
// ---------------------------------------------------------------------------
export const filterTicketsSchema = z
  .object({
    status: z.array(ticketStatusEnum).optional(),
    type: z.array(ticketTypeEnum).optional(),
    urgency: severityLevelEnum.optional(),
    priority_min: z.number().int().min(1).max(16).optional(),
    priority_max: z.number().int().min(1).max(16).optional(),
    assigned_agent_id: optionalUuid,
    assigned_group_id: optionalUuid,
    date_range: dateRangeSchema.optional(),
    search: z.string().trim().max(200).optional(),
  })
  .merge(paginationSchema)
  .merge(sortSchema.partial())
  .refine(
    (data) => {
      if (data.priority_min != null && data.priority_max != null) {
        return data.priority_max >= data.priority_min;
      }
      return true;
    },
    {
      message: 'priority_max must be >= priority_min',
      path: ['priority_max'],
    },
  );

export type FilterTicketsInput = z.infer<typeof filterTicketsSchema>;

// ---------------------------------------------------------------------------
// Add Follow-up
// ---------------------------------------------------------------------------
export const addFollowupSchema = z.object({
  content: requiredString.max(50_000, 'Content must be 50 000 characters or fewer'),
  content_html: z.string().max(200_000, 'Content HTML too large').optional(),
  is_private: z.boolean().default(false),
  mentioned_agent_ids: z.array(uuidSchema).optional().default([]),
  mentioned_contact_ids: z.array(uuidSchema).optional().default([]),
});

export type AddFollowupInput = z.infer<typeof addFollowupSchema>;

// ---------------------------------------------------------------------------
// Add Task
// ---------------------------------------------------------------------------
export const addTaskSchema = z.object({
  title: requiredString.max(255, 'Title must be 255 characters or fewer'),
  description: optionalString,
  assigned_agent_id: optionalUuid,
  due_date: z.coerce.date().optional().nullable(),
  estimated_hours: z
    .number()
    .positive('Estimated hours must be positive')
    .max(9999, 'Estimated hours is too large')
    .optional()
    .nullable(),
});

export type AddTaskInput = z.infer<typeof addTaskSchema>;

// ---------------------------------------------------------------------------
// Add Solution
// ---------------------------------------------------------------------------
export const addSolutionSchema = z.object({
  content: requiredString.max(50_000, 'Solution content must be 50 000 characters or fewer'),
});

export type AddSolutionInput = z.infer<typeof addSolutionSchema>;
