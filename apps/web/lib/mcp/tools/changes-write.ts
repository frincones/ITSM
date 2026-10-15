// ---------------------------------------------------------------------------
// MCP Tools — Change management (write + approval gate)
// ---------------------------------------------------------------------------
// Read tools (changes_list, changes_get) live in tools/changes.ts.
//
// Scope design: `changes:approve` is separate from `changes:write`.
// Approving a change is a governance decision, not an edit — it records who
// authorised the work. A key can draft, plan and schedule changes without
// being able to authorise them.
//
// The gate is enforced in the domain, not just by scopes: approve and reject
// write a change_validations row naming the approver, and the generic
// transition tool refuses to reach 'approved' or 'rejected' so nobody can
// slip past the audit trail with a status patch.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  CHANGE_STATUSES,
  CHANGE_TYPES,
  RISK_LEVELS,
  approveChange as domainApprove,
  createChange as domainCreate,
  listValidations as domainListValidations,
  rejectChange as domainReject,
  submitForApproval as domainSubmit,
  transitionChange as domainTransition,
  updateChange as domainUpdate,
} from '~/lib/domain/changes.domain';

import { toDomainContext, unwrap } from '../domain-bridge';
import { registry } from '../registry';

const changeStatus = z.enum(CHANGE_STATUSES);
const changeType = z.enum(CHANGE_TYPES);
const riskLevel = z.enum(RISK_LEVELS);

// ---------------------------------------------------------------------------
// changes_create
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_create',
  description:
    "Create a change request. It starts in 'new' and the database assigns the change_number. Types: standard (pre-approved routine), normal (goes through the full approval gate), emergency (raised mid-incident, exempt from the rollback-plan requirement).",
  scope: 'changes:write',
  inputSchema: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10_000).optional(),
    change_type: changeType.default('normal'),
    risk_level: riskLevel.default('medium'),
    impact_analysis: z.string().max(10_000).optional(),
    rollback_plan: z
      .string()
      .max(10_000)
      .optional()
      .describe('How to undo this change. Required before a non-emergency change can be submitted for approval.'),
    implementation_plan: z.string().max(10_000).optional(),
    scheduled_start: z.string().datetime().optional(),
    scheduled_end: z.string().datetime().optional(),
    category_id: z.string().uuid().optional(),
    assigned_agent_id: z.string().uuid().optional(),
    assigned_group_id: z.string().uuid().optional(),
  }),
  meta: { since: '1.5.0', tags: ['changes', 'write'] },
  async handler(ctx, input) {
    return { change: unwrap(await domainCreate(toDomainContext(ctx), input)) };
  },
});

// ---------------------------------------------------------------------------
// changes_update
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_update',
  description:
    'Update a change: plans, risk, schedule, assignment. Cannot move it through its lifecycle — use changes_transition, changes_submit, changes_approve or changes_reject. A closed or rejected change can no longer be edited.',
  scope: 'changes:write',
  inputSchema: z.object({
    change_id: z.string().uuid(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10_000).nullable().optional(),
    change_type: changeType.optional(),
    risk_level: riskLevel.optional(),
    impact_analysis: z.string().max(10_000).nullable().optional(),
    rollback_plan: z.string().max(10_000).nullable().optional(),
    implementation_plan: z.string().max(10_000).nullable().optional(),
    scheduled_start: z.string().datetime().nullable().optional(),
    scheduled_end: z.string().datetime().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    assigned_agent_id: z.string().uuid().nullable().optional(),
    assigned_group_id: z.string().uuid().nullable().optional(),
  }),
  meta: { since: '1.5.0', tags: ['changes', 'write'] },
  async handler(ctx, input) {
    const { change_id, ...patch } = input;
    return { change: unwrap(await domainUpdate(toDomainContext(ctx), change_id, patch)) };
  },
});

// ---------------------------------------------------------------------------
// changes_transition
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_transition',
  description:
    "Move a change through its lifecycle: new → evaluation → approval_pending → approved → scheduled → in_progress → testing → implemented → closed, with rejected and rolled_back as exits. Entering 'in_progress' stamps actual_start; 'implemented' and 'rolled_back' stamp actual_end. Cannot reach approved or rejected — those go through the approval tools so the decision is attributable.",
  scope: 'changes:write',
  inputSchema: z.object({
    change_id: z.string().uuid(),
    status: changeStatus,
  }),
  meta: { since: '1.5.0', tags: ['changes', 'write'] },
  async handler(ctx, input) {
    return {
      change: unwrap(await domainTransition(toDomainContext(ctx), input.change_id, input.status)),
    };
  },
});

// ---------------------------------------------------------------------------
// changes_submit
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_submit',
  description:
    "Submit a change for approval. It must be in 'evaluation'. Refused when there is no rollback plan — approving work nobody can undo is what change management exists to prevent. Emergency changes are exempt.",
  scope: 'changes:write',
  inputSchema: z.object({ change_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['changes', 'write'] },
  async handler(ctx, input) {
    return { change: unwrap(await domainSubmit(toDomainContext(ctx), input.change_id)) };
  },
});

// ---------------------------------------------------------------------------
// changes_approve
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_approve',
  description:
    "Approve a change waiting at the gate. Records who approved it and when, as a change_validations entry. The person who raised the change cannot approve it, and a key with no acting agent cannot approve at all — an approval with no approver is not an approval.",
  scope: 'changes:approve',
  inputSchema: z.object({
    change_id: z.string().uuid(),
    comment: z.string().max(2000).optional().describe('Rationale for the approval.'),
  }),
  meta: { since: '1.5.0', tags: ['changes', 'approval', 'governance'] },
  async handler(ctx, input) {
    return {
      change: unwrap(
        await domainApprove(toDomainContext(ctx), input.change_id, input.comment ?? null),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// changes_reject
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_reject',
  description:
    "Reject a change waiting at the gate. A reason is required and is stored on the validation record — 'rejected' is terminal, so whoever raised it needs to know what to fix before raising a new one.",
  scope: 'changes:approve',
  inputSchema: z.object({
    change_id: z.string().uuid(),
    comment: z.string().trim().min(1).max(2000).describe('Why the change was rejected.'),
  }),
  meta: { since: '1.5.0', tags: ['changes', 'approval', 'governance'] },
  async handler(ctx, input) {
    return {
      change: unwrap(await domainReject(toDomainContext(ctx), input.change_id, input.comment)),
    };
  },
});

// ---------------------------------------------------------------------------
// changes_validations
// ---------------------------------------------------------------------------

registry.register({
  name: 'changes_validations',
  description:
    'Approval history for a change: every decision, who made it, when, and the comment they left. Use this to answer who authorised a change that is now in production.',
  scope: 'changes:read',
  inputSchema: z.object({ change_id: z.string().uuid() }),
  meta: { since: '1.5.0', tags: ['changes', 'read'] },
  async handler(ctx, input) {
    return unwrap(await domainListValidations(toDomainContext(ctx), input.change_id));
  },
});

/** Marker observed by lib/mcp/server.ts to defeat tree-shaking. */
export const __changesWriteToolsLoaded = true;
