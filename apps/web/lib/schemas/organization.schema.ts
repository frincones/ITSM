import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  optionalString,
  emailSchema,
  optionalEmail,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgAccessLevelEnum = z.enum([
  'full',
  'tickets_only',
  'readonly',
  'portal_admin',
]);

export const orgUserRoleEnum = z.enum([
  'admin',
  'manager',
  'user',
  'readonly',
]);

// ---------------------------------------------------------------------------
// Brand Colors (nested object)
// ---------------------------------------------------------------------------

const brandColorsSchema = z
  .object({
    primary: optionalString,
    secondary: optionalString,
  })
  .optional()
  .nullable();

// ---------------------------------------------------------------------------
// Create Organization
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: requiredString.max(255, 'Name must be 255 characters or fewer'),
  slug: requiredString
    .max(100, 'Slug must be 100 characters or fewer')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with hyphens, no spaces',
    ),
  domain: optionalString,
  industry: optionalString,
  contact_name: optionalString,
  contact_email: optionalEmail,
  contact_phone: optionalString,
  address: optionalString,
  notes: optionalString,
  sla_id: optionalUuid,
  max_users: z
    .number()
    .int('Max users must be an integer')
    .min(1, 'Max users must be at least 1')
    .max(100_000, 'Max users is too large')
    .optional()
    .nullable(),
  contract_start: z.coerce.date().optional().nullable(),
  contract_end: z.coerce.date().optional().nullable(),
  brand_colors: brandColorsSchema,
  logo_url: optionalString,
  ai_context: z
    .string()
    .max(100_000, 'AI context must be 100,000 characters or fewer')
    .optional()
    .nullable(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// ---------------------------------------------------------------------------
// Update Organization
// ---------------------------------------------------------------------------

export const updateOrganizationSchema = createOrganizationSchema.partial();

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// ---------------------------------------------------------------------------
// Assign Agent to Organization
// ---------------------------------------------------------------------------

export const assignAgentSchema = z.object({
  agent_id: uuidSchema,
  organization_id: uuidSchema,
  access_level: orgAccessLevelEnum,
});

export type AssignAgentInput = z.infer<typeof assignAgentSchema>;

// ---------------------------------------------------------------------------
// Create Organization User
// ---------------------------------------------------------------------------

export const createOrgUserSchema = z.object({
  name: requiredString.max(255, 'Name must be 255 characters or fewer'),
  email: emailSchema,
  phone: optionalString,
  role: orgUserRoleEnum.default('user'),
  organization_id: uuidSchema,
});

export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;

// ---------------------------------------------------------------------------
// Organization Filter (for scoping queries)
// ---------------------------------------------------------------------------

export const orgFilterSchema = z.object({
  organization_id: optionalUuid,
});

export type OrgFilterInput = z.infer<typeof orgFilterSchema>;
