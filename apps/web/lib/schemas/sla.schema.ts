import { z } from 'zod';

import { requiredString, optionalString } from './common.schema';

// ---------------------------------------------------------------------------
// SLA Level Action Type
// ---------------------------------------------------------------------------
export const slaActionTypeEnum = z.enum([
  'notify_agent',
  'notify_supervisor',
  'escalate_group',
  'notify_admin',
]);

// ---------------------------------------------------------------------------
// SLA Level
// ---------------------------------------------------------------------------
export const slaLevelSchema = z.object({
  level: z.number().int().min(1).max(10),
  minutes_before_breach: z.number().int(),
  action_type: slaActionTypeEnum,
  target_agent_id: z.string().uuid().optional().nullable(),
  target_group_id: z.string().uuid().optional().nullable(),
});

export type SlaLevelInput = z.infer<typeof slaLevelSchema>;

// ---------------------------------------------------------------------------
// Create SLA
// ---------------------------------------------------------------------------
export const createSlaSchema = z.object({
  name: requiredString.max(100, 'Name must be 100 characters or fewer'),
  description: optionalString,
  is_default: z.boolean().default(false),
  targets: z.object({
    first_response: z.object({
      low: z.number().int().positive('Minutes must be positive'),
      medium: z.number().int().positive('Minutes must be positive'),
      high: z.number().int().positive('Minutes must be positive'),
      critical: z.number().int().positive('Minutes must be positive'),
    }),
    resolution: z.object({
      low: z.number().int().positive('Minutes must be positive'),
      medium: z.number().int().positive('Minutes must be positive'),
      high: z.number().int().positive('Minutes must be positive'),
      critical: z.number().int().positive('Minutes must be positive'),
    }),
  }),
  calendar_id: z.string().uuid().optional().nullable(),
  levels: z.array(slaLevelSchema).min(1, 'At least one SLA level is required'),
});

export type CreateSlaInput = z.infer<typeof createSlaSchema>;
