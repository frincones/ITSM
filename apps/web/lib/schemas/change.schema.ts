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
export const changeStatusEnum = z.enum([
  'new',
  'evaluation',
  'approval_pending',
  'approved',
  'scheduled',
  'in_progress',
  'testing',
  'implemented',
  'rolled_back',
  'closed',
  'rejected',
]);

export const changeTypeEnum = z.enum(['standard', 'normal', 'emergency']);

export const riskLevelEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const approvalStatusEnum = z.enum(['pending', 'approved', 'rejected']);

// ---------------------------------------------------------------------------
// Create Change
// ---------------------------------------------------------------------------
export const createChangeSchema = z
  .object({
    title: requiredString.max(255, 'Title must be 255 characters or fewer'),
    description: optionalString,
    change_type: changeTypeEnum.default('normal'),
    risk_level: riskLevelEnum.default('medium'),
    impact_analysis: optionalString,
    rollback_plan: optionalString,
    implementation_plan: optionalString,
    scheduled_start: z.coerce.date().optional().nullable(),
    scheduled_end: z.coerce.date().optional().nullable(),
    category_id: optionalUuid,
    assigned_agent_id: optionalUuid,
    assigned_group_id: optionalUuid,
  })
  .refine(
    (data) => {
      if (data.scheduled_start && data.scheduled_end) {
        return data.scheduled_end >= data.scheduled_start;
      }
      return true;
    },
    {
      message: 'Scheduled end must be equal to or after scheduled start',
      path: ['scheduled_end'],
    },
  );

export type CreateChangeInput = z.infer<typeof createChangeSchema>;

// ---------------------------------------------------------------------------
// Update Change
// ---------------------------------------------------------------------------
export const updateChangeSchema = z
  .object({
    title: requiredString.max(255, 'Title must be 255 characters or fewer').optional(),
    description: optionalString,
    change_type: changeTypeEnum.optional(),
    risk_level: riskLevelEnum.optional(),
    status: changeStatusEnum.optional(),
    impact_analysis: optionalString,
    rollback_plan: optionalString,
    implementation_plan: optionalString,
    scheduled_start: z.coerce.date().optional().nullable(),
    scheduled_end: z.coerce.date().optional().nullable(),
    actual_start: z.coerce.date().optional().nullable(),
    actual_end: z.coerce.date().optional().nullable(),
    category_id: optionalUuid,
    assigned_agent_id: optionalUuid,
    assigned_group_id: optionalUuid,
  })
  .refine(
    (data) => {
      if (data.scheduled_start && data.scheduled_end) {
        return data.scheduled_end >= data.scheduled_start;
      }
      return true;
    },
    {
      message: 'Scheduled end must be equal to or after scheduled start',
      path: ['scheduled_end'],
    },
  );

export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;

// ---------------------------------------------------------------------------
// Change Validation (CAB approval)
// ---------------------------------------------------------------------------
export const changeValidationSchema = z.object({
  change_id: uuidSchema,
  status: approvalStatusEnum,
  comment: optionalString,
});

export type ChangeValidationInput = z.infer<typeof changeValidationSchema>;
