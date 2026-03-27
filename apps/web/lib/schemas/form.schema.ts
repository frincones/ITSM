import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
} from './common.schema';

// ---------------------------------------------------------------------------
// Question Types
// ---------------------------------------------------------------------------
export const formQuestionTypeEnum = z.enum([
  'short_text',
  'long_text',
  'number',
  'email',
  'dropdown',
  'multi_select',
  'checkbox',
  'date',
  'file_upload',
]);

// ---------------------------------------------------------------------------
// Form Question Schema
// ---------------------------------------------------------------------------
export const formQuestionSchema = z.object({
  label: requiredString.max(255, 'Label must be 255 characters or fewer'),
  type: formQuestionTypeEnum,
  is_required: z.boolean().default(false),
  placeholder: optionalString,
  help_text: optionalString,
  options: z.array(z.string().trim().min(1)).optional().default([]),
  validation: z.record(z.unknown()).optional().default({}),
  order: z.number().int().min(0).default(0),
});

export type FormQuestionInput = z.infer<typeof formQuestionSchema>;

// ---------------------------------------------------------------------------
// Form Section Schema
// ---------------------------------------------------------------------------
export const formSectionSchema = z.object({
  title: requiredString.max(150, 'Section title must be 150 characters or fewer'),
  description: optionalString,
  order: z.number().int().min(0).default(0),
  questions: z.array(formQuestionSchema).min(1, 'At least one question is required'),
});

export type FormSectionInput = z.infer<typeof formSectionSchema>;

// ---------------------------------------------------------------------------
// Create Form
// ---------------------------------------------------------------------------
export const createFormSchema = z.object({
  name: requiredString.max(150, 'Name must be 150 characters or fewer'),
  description: optionalString,
  category_id: optionalUuid,
  is_active: z.boolean().default(true),
  sections: z.array(formSectionSchema).min(1, 'At least one section is required'),
});

export type CreateFormInput = z.infer<typeof createFormSchema>;

// ---------------------------------------------------------------------------
// Submit Form (portal user submits answers)
// ---------------------------------------------------------------------------
export const submitFormAnswerSchema = z.object({
  question_id: uuidSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]),
});

export type SubmitFormAnswerInput = z.infer<typeof submitFormAnswerSchema>;

export const submitFormSchema = z.object({
  form_id: uuidSchema,
  contact_id: uuidSchema,
  answers: z.array(submitFormAnswerSchema).min(1, 'At least one answer is required'),
});

export type SubmitFormInput = z.infer<typeof submitFormSchema>;
