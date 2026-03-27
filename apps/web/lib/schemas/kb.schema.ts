import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const articleStatusEnum = z.enum([
  'draft',
  'in_review',
  'published',
  'archived',
]);

export const articleVisibilityEnum = z.enum([
  'internal',
  'public',
]);

// ---------------------------------------------------------------------------
// Create Article
// ---------------------------------------------------------------------------
export const createArticleSchema = z.object({
  title: requiredString.max(255, 'Title must be 255 characters or fewer'),
  content: requiredString.max(100_000, 'Content must be 100 000 characters or fewer'),
  summary: optionalString,
  category_id: optionalUuid,
  visibility: articleVisibilityEnum.default('internal'),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;

// ---------------------------------------------------------------------------
// Update Article
// ---------------------------------------------------------------------------
export const updateArticleSchema = createArticleSchema.partial().extend({
  status: articleStatusEnum.optional(),
});

export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

// ---------------------------------------------------------------------------
// Article Feedback
// ---------------------------------------------------------------------------
export const articleFeedbackSchema = z.object({
  article_id: uuidSchema,
  is_helpful: z.boolean(),
  comment: optionalString,
});

export type ArticleFeedbackInput = z.infer<typeof articleFeedbackSchema>;
