import { z } from 'zod';

import { optionalUuid, requiredString, optionalString } from './common.schema';

// ---------------------------------------------------------------------------
// Valid "applies_to" values (matches categories.applies_to CHECK in DB)
// ---------------------------------------------------------------------------
const appliesToItemEnum = z.enum(['ticket', 'problem', 'change']);

// ---------------------------------------------------------------------------
// Create Category
// ---------------------------------------------------------------------------
export const createCategorySchema = z.object({
  name: requiredString.max(100, 'Name must be 100 characters or fewer'),
  parent_id: optionalUuid,
  applies_to: z
    .array(appliesToItemEnum)
    .min(1, 'At least one applies_to value is required')
    .default(['ticket', 'problem', 'change']),
  icon: optionalString,
  sort_order: z.number().int().min(0).default(0),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
