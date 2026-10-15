// ---------------------------------------------------------------------------
// MCP Tools — Organizations (write) and support contracts
// ---------------------------------------------------------------------------
// Read tools (organizations_list, organizations_get) live in
// tools/organizations.ts. This module adds client administration.
//
// Scope design: `organizations:deactivate` is separate from
// `organizations:write`. Deactivating a client takes its portal offline for
// every one of its users immediately, which is an operational incident, not
// an edit. Everything else — renaming, contact details, routing defaults,
// agent access — sits behind organizations:write.
//
// Deliberately absent: creating portal users. That means provisioning an
// identity and sending an invitation email, which stays out of the MCP.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  ORG_ACCESS_LEVELS,
  ORG_USER_ROLES,
  assignAgent as domainAssignAgent,
  createOrganization as domainCreate,
  getContracts as domainGetContracts,
  listAgentAccess as domainListAgents,
  listUsers as domainListUsers,
  removeAgent as domainRemoveAgent,
  setOrganizationActive as domainSetActive,
  updateOrganization as domainUpdate,
  updateUser as domainUpdateUser,
} from '~/lib/domain/organizations.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const accessLevel = z.enum(ORG_ACCESS_LEVELS);
const userRole = z.enum(ORG_USER_ROLES);

// A date-only string (contract_start / contract_end are DATE columns).
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// organizations_create
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_create',
  description:
    'Create a client organization. The slug is derived from the name and de-duplicated; it forms part of the portal URL. Keys restricted to specific organizations cannot create new ones.',
  scope: 'organizations:write',
  inputSchema: z.object({
    name: z.string().trim().min(1).max(255),
    slug: z.string().trim().min(1).max(60).optional(),
    domain: z.string().trim().max(255).optional(),
    industry: z.string().trim().max(100).optional(),
    contact_name: z.string().trim().max(255).optional(),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().trim().max(50).optional(),
    address: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    max_users: z.number().int().min(1).max(10_000).default(10),
    contract_start: dateOnly.optional(),
    contract_end: dateOnly.optional(),
    default_agent_id: z
      .string()
      .uuid()
      .optional()
      .describe('Agent new tickets from this client are auto-assigned to.'),
    default_group_id: z.string().uuid().optional(),
    default_category_id: z.string().uuid().optional(),
    sla_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write'] },
  async handler(ctx, input) {
    return { organization: unwrap(await domainCreate(toDomainContext(ctx), input)) };
  },
});

// ---------------------------------------------------------------------------
// organizations_update
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_update',
  description:
    'Update a client: contact details, routing defaults (default_agent_id drives auto-assignment), contract dates or notes. Changing the slug changes the portal URL, so it only happens when slug is passed explicitly. Cannot activate or deactivate — use organizations_set_active.',
  scope: 'organizations:write',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    slug: z.string().trim().min(1).max(60).optional(),
    domain: z.string().trim().max(255).nullable().optional(),
    industry: z.string().trim().max(100).nullable().optional(),
    contact_name: z.string().trim().max(255).nullable().optional(),
    contact_email: z.string().email().nullable().optional(),
    contact_phone: z.string().trim().max(50).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    max_users: z.number().int().min(1).max(10_000).optional(),
    contract_start: dateOnly.nullable().optional(),
    contract_end: dateOnly.nullable().optional(),
    default_agent_id: z.string().uuid().nullable().optional(),
    default_group_id: z.string().uuid().nullable().optional(),
    default_category_id: z.string().uuid().nullable().optional(),
    sla_id: z.string().uuid().nullable().optional(),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write'] },
  async handler(ctx, input) {
    const { organization_id, ...patch } = input;
    return {
      organization: unwrap(await domainUpdate(toDomainContext(ctx), organization_id, patch)),
    };
  },
});

// ---------------------------------------------------------------------------
// organizations_set_active
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_set_active',
  description:
    'Activate or deactivate a client. DEACTIVATING TAKES THEIR PORTAL OFFLINE IMMEDIATELY — every user of that client loses access to open and follow tickets. Refused while the client still has open tickets unless force: true. User accounts are untouched, so reactivating restores access exactly as it was.',
  scope: 'organizations:deactivate',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    is_active: z.boolean(),
    force: z
      .boolean()
      .default(false)
      .describe('Deactivate even with open tickets. Confirm with a human first.'),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write', 'dangerous'] },
  async handler(ctx, input) {
    return unwrap(
      await domainSetActive(toDomainContext(ctx), input.organization_id, input.is_active, {
        force: input.force,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// organizations_assign_agent
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_assign_agent',
  description:
    'Grant an agent access to a client, or change their access level. Levels: full, tickets_only, readonly, portal_admin. Idempotent — assigning twice updates the level instead of failing.',
  scope: 'organizations:write',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    agent_id: z.string().uuid(),
    access_level: accessLevel.default('full'),
    is_default: z
      .boolean()
      .default(false)
      .describe("Mark as the agent's default client in their workspace."),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write'] },
  async handler(ctx, input) {
    return {
      access: unwrap(
        await domainAssignAgent(toDomainContext(ctx), input.organization_id, input.agent_id, {
          accessLevel: input.access_level,
          isDefault: input.is_default,
        }),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// organizations_remove_agent
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_remove_agent',
  description:
    "Revoke an agent's access to a client. Refused if they are the client's default owner — new tickets would land unassigned with no obvious cause; set a different default_agent_id first.",
  scope: 'organizations:write',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    agent_id: z.string().uuid(),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainRemoveAgent(toDomainContext(ctx), input.organization_id, input.agent_id),
    );
  },
});

// ---------------------------------------------------------------------------
// organizations_list_agents
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_list_agents',
  description:
    'List the internal agents who can see a client, with their access level and whether it is their default client.',
  scope: 'organizations:read',
  inputSchema: z.object({ organization_id: z.string().uuid() }),
  meta: { since: '1.4.0', tags: ['organizations', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListAgents(toDomainContext(ctx), input.organization_id));
  },
});

// ---------------------------------------------------------------------------
// organizations_list_users
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_list_users',
  description:
    "List a client's portal users with their role and last login. These are the people who raise and follow tickets from the customer side.",
  scope: 'organizations:read',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    active_only: z.boolean().default(false),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainListUsers(toDomainContext(ctx), input.organization_id, {
        activeOnly: input.active_only,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// organizations_update_user
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_update_user',
  description:
    "Update a portal user's name, phone, role or active flag. Setting is_active: false stops that one person logging into the portal without affecting the rest of the client. Creating users is not available over MCP — it requires provisioning an identity and sending an invitation.",
  scope: 'organizations:write',
  inputSchema: z.object({
    organization_id: z.string().uuid(),
    user_row_id: z
      .string()
      .uuid()
      .describe('The organization_users.id from organizations_list_users, not the auth user id.'),
    name: z.string().trim().min(1).max(255).optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    role: userRole.optional(),
    is_active: z.boolean().optional(),
  }),
  meta: { since: '1.4.0', tags: ['organizations', 'write'] },
  async handler(ctx, input) {
    const { organization_id, user_row_id, ...patch } = input;
    return {
      user: unwrap(
        await domainUpdateUser(toDomainContext(ctx), organization_id, user_row_id, patch),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// organizations_contracts
// ---------------------------------------------------------------------------

registry.register({
  name: 'organizations_contracts',
  description:
    "A client's support contract: monthly ticket quota, unit price, fee, billing cycle day, whether SLA is enabled, and the per-severity response targets. Returns the contract in force today plus the full history, so you can explain what the terms were when an older ticket was raised.",
  scope: 'organizations:read',
  inputSchema: z.object({ organization_id: z.string().uuid() }),
  meta: { since: '1.4.0', tags: ['organizations', 'contracts', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainGetContracts(toDomainContext(ctx), input.organization_id));
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __organizationsWriteToolsLoaded = true;
