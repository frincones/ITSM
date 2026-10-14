// ---------------------------------------------------------------------------
// MCP Tools — Operations and catalog
// ---------------------------------------------------------------------------
// Asset custody, problem investigation, contact maintenance, and read access
// to the reference catalog tickets route on.
//
// The catalog is read-only over MCP on purpose. A category or group is
// referenced by tickets, rules, workflows and SLA policies; renaming or
// deactivating one reshapes routing everywhere at once. An agent needs to
// READ them to fill category_id and assigned_group_id correctly — changing
// them is an administrative act that stays in the UI.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  ASSET_STATUSES,
  PROBLEM_STATUSES,
  assignAsset as domainAssignAsset,
  createAsset as domainCreateAsset,
  getAssetHistory as domainAssetHistory,
  getCatalog as domainCatalog,
  linkTicketToProblem as domainLinkTicket,
  listProblemTickets as domainProblemTickets,
  returnAsset as domainReturnAsset,
  transitionProblem as domainTransitionProblem,
  updateAsset as domainUpdateAsset,
  updateContact as domainUpdateContact,
  updateProblem as domainUpdateProblem,
} from '~/lib/domain/operations.domain';
import { severityLevelEnum } from '~/lib/schemas/ticket.schema';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const assetStatus = z.enum(ASSET_STATUSES);
const problemStatus = z.enum(PROBLEM_STATUSES);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

registry.register({
  name: 'assets_create',
  description:
    'Register an asset in the inventory. asset_tag is the human-readable identifier and must be unique within the tenant. Leave organization_id empty for unassigned stock held by the provider.',
  scope: 'assets:write',
  inputSchema: z.object({
    asset_tag: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(255),
    asset_type_id: z.string().uuid().optional(),
    status: assetStatus.default('available'),
    serial_number: z.string().trim().max(255).optional(),
    purchase_date: dateOnly.optional(),
    purchase_cost: z.number().min(0).optional(),
    location: z.string().trim().max(255).optional(),
    notes: z.string().max(2000).optional(),
    organization_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.7.0', tags: ['assets', 'write'] },
  async handler(ctx, input) {
    return { asset: unwrap(await domainCreateAsset(toDomainContext(ctx), input)) };
  },
});

registry.register({
  name: 'assets_update',
  description:
    "Update an asset's details or status. Marking an asset retired or lost while it is still assigned is refused — return it first, so the custody chain does not claim a holder for something written off.",
  scope: 'assets:write',
  inputSchema: z.object({
    asset_id: z.string().uuid(),
    asset_tag: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    asset_type_id: z.string().uuid().nullable().optional(),
    status: assetStatus.optional(),
    serial_number: z.string().trim().max(255).nullable().optional(),
    purchase_date: dateOnly.nullable().optional(),
    purchase_cost: z.number().min(0).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
  }),
  meta: { since: '1.7.0', tags: ['assets', 'write'] },
  async handler(ctx, input) {
    const { asset_id, ...patch } = input;
    return { asset: unwrap(await domainUpdateAsset(toDomainContext(ctx), asset_id, patch)) };
  },
});

registry.register({
  name: 'assets_assign',
  description:
    "Hand an asset to an agent. Sets the current holder, moves the asset to in_use and opens a custody record. Refused if the asset is already assigned to someone else, or is retired or lost.",
  scope: 'assets:write',
  inputSchema: z.object({
    asset_id: z.string().uuid(),
    agent_id: z.string().uuid(),
    notes: z.string().max(1000).optional(),
  }),
  meta: { since: '1.7.0', tags: ['assets', 'write'] },
  async handler(ctx, input) {
    return {
      asset: unwrap(
        await domainAssignAsset(
          toDomainContext(ctx),
          input.asset_id,
          input.agent_id,
          input.notes ?? null,
        ),
      ),
    };
  },
});

registry.register({
  name: 'assets_return',
  description:
    'Take an asset back from its holder: closes the open custody record and clears the current holder. Pass status to send it somewhere other than available — maintenance, retired or lost.',
  scope: 'assets:write',
  inputSchema: z.object({
    asset_id: z.string().uuid(),
    status: assetStatus.default('available'),
    notes: z.string().max(1000).optional(),
  }),
  meta: { since: '1.7.0', tags: ['assets', 'write'] },
  async handler(ctx, input) {
    return {
      asset: unwrap(
        await domainReturnAsset(toDomainContext(ctx), input.asset_id, {
          status: input.status,
          notes: input.notes ?? null,
        }),
      ),
    };
  },
});

registry.register({
  name: 'assets_history',
  description:
    'Custody history for an asset: everyone who has held it, when they received it and when they returned it. An entry with no returned_at is the current holder.',
  scope: 'assets:read',
  inputSchema: z.object({ asset_id: z.string().uuid() }),
  meta: { since: '1.7.0', tags: ['assets', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainAssetHistory(toDomainContext(ctx), input.asset_id));
  },
});

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

registry.register({
  name: 'problems_update',
  description:
    'Update a problem: title, description, severity, assignment, and the investigation fields — root_cause, workaround and solution. Status moves through problems_transition.',
  scope: 'problems:write',
  inputSchema: z.object({
    problem_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10_000).nullable().optional(),
    urgency: severityLevelEnum.optional(),
    impact: severityLevelEnum.optional(),
    root_cause: z.string().max(10_000).nullable().optional(),
    workaround: z
      .string()
      .max(10_000)
      .nullable()
      .optional()
      .describe('What unblocks affected users while the fix is pending.'),
    solution: z.string().max(10_000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    assigned_agent_id: z.string().uuid().nullable().optional(),
    assigned_group_id: z.string().uuid().nullable().optional(),
  }),
  meta: { since: '1.7.0', tags: ['problems', 'write'] },
  async handler(ctx, input) {
    const { problem_id, ...patch } = input;
    return {
      problem: unwrap(await domainUpdateProblem(toDomainContext(ctx), problem_id, patch)),
    };
  },
});

registry.register({
  name: 'problems_transition',
  description:
    'Move a problem through its investigation: new → accepted → analysis → root_cause_identified → solution_planned → resolved → closed. Reaching root_cause_identified requires a recorded root cause, and resolving requires a recorded solution — a problem record should not claim knowledge it does not hold.',
  scope: 'problems:write',
  inputSchema: z.object({
    problem_id: z.string().uuid(),
    status: problemStatus,
  }),
  meta: { since: '1.7.0', tags: ['problems', 'write'] },
  async handler(ctx, input) {
    return {
      problem: unwrap(
        await domainTransitionProblem(toDomainContext(ctx), input.problem_id, input.status),
      ),
    };
  },
});

registry.register({
  name: 'problems_link_ticket',
  description:
    'Link a ticket to a problem as one of its symptoms. Idempotent — linking twice is not an error. Use it to gather the recurring tickets that justify a root-cause investigation.',
  scope: 'problems:write',
  inputSchema: z.object({
    problem_id: z.string().uuid(),
    ticket_id: z.string().uuid(),
  }),
  meta: { since: '1.7.0', tags: ['problems', 'tickets', 'write'] },
  async handler(ctx, input) {
    return unwrap(
      await domainLinkTicket(toDomainContext(ctx), input.problem_id, input.ticket_id),
    );
  },
});

registry.register({
  name: 'problems_tickets',
  description:
    'The tickets linked to a problem — the symptoms it was raised to explain. Use it to size the impact of a known issue.',
  scope: 'problems:read',
  inputSchema: z.object({ problem_id: z.string().uuid() }),
  meta: { since: '1.7.0', tags: ['problems', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainProblemTickets(toDomainContext(ctx), input.problem_id));
  },
});

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

registry.register({
  name: 'contacts_update',
  description:
    "Update a contact's details or move them to a different client organization. Contacts are the requester side of tickets; use contacts_upsert to create one.",
  scope: 'contacts:write',
  inputSchema: z.object({
    contact_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    company: z.string().trim().max(255).nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
  }),
  meta: { since: '1.7.0', tags: ['contacts', 'write'] },
  async handler(ctx, input) {
    const { contact_id, ...patch } = input;
    return { contact: unwrap(await domainUpdateContact(toDomainContext(ctx), contact_id, patch)) };
  },
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

registry.register({
  name: 'catalog_list',
  description:
    'The reference data tickets route on: categories (with their default group and SLA), groups (with auto-assign settings), service catalogs and asset types. Call this to resolve the ids needed by tickets_create, tickets_assign and assets_create instead of guessing them. Read-only: changing the catalog reshapes routing across tickets, rules and workflows at once, so it stays in the UI.',
  scope: 'catalog:read',
  inputSchema: z.object({
    include: z
      .array(z.enum(['categories', 'groups', 'services', 'asset_types']))
      .optional()
      .describe('Defaults to all four.'),
    active_only: z.boolean().default(true),
  }),
  meta: { since: '1.7.0', tags: ['catalog', 'read'] },
  async handler(ctx, input) {
    return unwrap(
      await domainCatalog(toDomainContext(ctx), {
        include: input.include,
        activeOnly: input.active_only,
      }),
    );
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __operationsToolsLoaded = true;
