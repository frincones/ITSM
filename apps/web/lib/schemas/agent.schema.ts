import { z } from 'zod';

import {
  uuidSchema,
  optionalUuid,
  requiredString,
  emailSchema,
} from './common.schema';

// ---------------------------------------------------------------------------
// Enum (mirrors PostgreSQL agent_role)
// ---------------------------------------------------------------------------
export const agentRoleEnum = z.enum([
  'admin',
  'supervisor',
  'agent',
  'readonly',
]);

// ---------------------------------------------------------------------------
// Create Agent
// ---------------------------------------------------------------------------
export const createAgentSchema = z.object({
  name: requiredString.max(100, 'Name must be 100 characters or fewer'),
  email: emailSchema,
  role: agentRoleEnum.default('agent'),
  profile_id: optionalUuid,
  skills: z.array(z.string().trim().min(1)).optional().default([]),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

// ---------------------------------------------------------------------------
// Update Agent
// ---------------------------------------------------------------------------
export const updateAgentSchema = createAgentSchema.partial();

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
