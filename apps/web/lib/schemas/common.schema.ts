import { z } from 'zod';

// ---------------------------------------------------------------------------
// UUID
// ---------------------------------------------------------------------------
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export const paginationSchema = z.object({
  page: z
    .number()
    .int()
    .min(1, 'Page must be >= 1')
    .default(1),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be >= 1')
    .max(100, 'Limit must be <= 100')
    .default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Date Range
// ---------------------------------------------------------------------------
export const dateRangeSchema = z
  .object({
    from: z.coerce.date({ required_error: 'Start date is required' }),
    to: z.coerce.date({ required_error: 'End date is required' }),
  })
  .refine((data) => data.to >= data.from, {
    message: '"to" date must be equal to or after "from" date',
    path: ['to'],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------
export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

export const sortSchema = z.object({
  sortBy: z.string().min(1, 'Sort field is required'),
  sortDirection: sortDirectionSchema,
});

export type SortInput = z.infer<typeof sortSchema>;

// ---------------------------------------------------------------------------
// Reusable helpers
// ---------------------------------------------------------------------------

/** Optional UUID — accepts undefined / null or a valid UUID string. */
export const optionalUuid = uuidSchema.optional().nullable();

/** Non-empty trimmed string. */
export const requiredString = z.string().trim().min(1, 'This field is required');

/** Optional trimmed string (empty string becomes undefined). */
export const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** Email schema with validation. */
export const emailSchema = z.string().trim().email('Invalid email address');

/** Optional email. */
export const optionalEmail = emailSchema.optional().nullable();
