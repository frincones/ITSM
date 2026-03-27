// ---------------------------------------------------------------------------
// Rules / Automation Engine — Business Logic Service
// ---------------------------------------------------------------------------
// Pure business logic. No 'use server' — used by Server Actions, cron jobs,
// and workflow engine.
// ---------------------------------------------------------------------------

import type { RuleConditionInput, RuleActionInput } from '~/lib/schemas/rule.schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a rule loaded from the database with its conditions and actions.
 */
interface Rule {
  id: string;
  tenant_id: string;
  name: string;
  trigger: string;
  is_active: boolean;
  execution_order: number;
  stop_on_match: boolean;
  conditions: RuleConditionInput[];
  actions: RuleActionInput[];
}

/**
 * Context object passed to rule evaluation. Contains the entity data
 * that conditions are evaluated against (ticket fields, etc.).
 */
interface RuleContext {
  /** The entity being evaluated (e.g., ticket, problem, change). */
  entity: Record<string, unknown>;
  /** The tenant ID for scoping. */
  tenant_id: string;
  /** Previous state of the entity (for change detection). */
  previous?: Record<string, unknown>;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a single rule evaluation.
 */
interface RuleEvaluationResult {
  rule_id: string;
  rule_name: string;
  matched: boolean;
  actions_executed: ActionExecutionResult[];
  error?: string;
}

/**
 * Result of executing a single action.
 */
interface ActionExecutionResult {
  action_type: string;
  success: boolean;
  error?: string;
  result?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. evaluateRules
// ---------------------------------------------------------------------------

/**
 * Finds all active rules matching the given trigger, evaluates their
 * conditions against the context, and executes actions for matching rules.
 *
 * Rules are evaluated in `execution_order` (ascending). If a rule has
 * `stop_on_match: true` and its conditions match, no further rules are
 * evaluated.
 *
 * @param trigger - The event trigger (e.g., 'ticket.created')
 * @param context - The evaluation context containing entity data
 * @param rules - Pre-loaded rules for this tenant/trigger (sorted by execution_order)
 * @returns Array of evaluation results
 */
export async function evaluateRules(
  trigger: string,
  context: RuleContext,
  rules: Rule[],
): Promise<RuleEvaluationResult[]> {
  const results: RuleEvaluationResult[] = [];

  // Filter active rules matching this trigger, sorted by execution_order
  const matchingRules = rules
    .filter((r) => r.is_active && r.trigger === trigger)
    .sort((a, b) => a.execution_order - b.execution_order);

  for (const rule of matchingRules) {
    try {
      // Evaluate all conditions (AND logic — all must match)
      const allConditionsMet = rule.conditions.every((condition) =>
        evaluateCondition(condition, context),
      );

      if (!allConditionsMet) {
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          matched: false,
          actions_executed: [],
        });
        continue;
      }

      // Execute all actions for this rule
      const actionResults: ActionExecutionResult[] = [];
      for (const action of rule.actions) {
        const actionResult = await executeAction(action, context);
        actionResults.push(actionResult);
      }

      results.push({
        rule_id: rule.id,
        rule_name: rule.name,
        matched: true,
        actions_executed: actionResults,
      });

      // Stop processing further rules if stop_on_match is set
      if (rule.stop_on_match) {
        break;
      }
    } catch (err) {
      results.push({
        rule_id: rule.id,
        rule_name: rule.name,
        matched: false,
        actions_executed: [],
        error: err instanceof Error ? err.message : 'Unknown error evaluating rule',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. evaluateCondition
// ---------------------------------------------------------------------------

/**
 * Evaluates a single condition against the rule context.
 *
 * Supported operators:
 * - `equals` / `not_equals`: strict equality comparison (string-coerced)
 * - `contains` / `not_contains`: substring check (case-insensitive)
 * - `in` / `not_in`: checks if field value is in an array of values
 * - `greater_than` / `less_than`: numeric comparison
 * - `is_empty` / `is_not_empty`: null/undefined/empty-string check
 * - `regex`: regular expression match
 *
 * @param condition - The condition to evaluate
 * @param context - The rule context containing entity data
 * @returns `true` if the condition is met
 */
export function evaluateCondition(
  condition: RuleConditionInput,
  context: RuleContext,
): boolean {
  const fieldValue = getNestedValue(context.entity, condition.field);
  const conditionValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return String(fieldValue) === String(conditionValue);

    case 'not_equals':
      return String(fieldValue) !== String(conditionValue);

    case 'contains': {
      const fieldStr = String(fieldValue ?? '').toLowerCase();
      const searchStr = String(conditionValue).toLowerCase();
      return fieldStr.includes(searchStr);
    }

    case 'not_contains': {
      const fieldStr = String(fieldValue ?? '').toLowerCase();
      const searchStr = String(conditionValue).toLowerCase();
      return !fieldStr.includes(searchStr);
    }

    case 'in': {
      const values = Array.isArray(conditionValue)
        ? conditionValue.map(String)
        : String(conditionValue).split(',').map((s) => s.trim());
      return values.includes(String(fieldValue));
    }

    case 'not_in': {
      const values = Array.isArray(conditionValue)
        ? conditionValue.map(String)
        : String(conditionValue).split(',').map((s) => s.trim());
      return !values.includes(String(fieldValue));
    }

    case 'greater_than':
      return Number(fieldValue) > Number(conditionValue);

    case 'less_than':
      return Number(fieldValue) < Number(conditionValue);

    case 'is_empty':
      return (
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case 'is_not_empty':
      return (
        fieldValue !== null &&
        fieldValue !== undefined &&
        fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case 'regex': {
      try {
        const pattern = new RegExp(String(conditionValue), 'i');
        return pattern.test(String(fieldValue ?? ''));
      } catch {
        // Invalid regex pattern — condition fails
        return false;
      }
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 3. executeAction
// ---------------------------------------------------------------------------

/**
 * Executes a single automation action.
 *
 * Supported action types:
 * - `set_field`: sets a field on the entity (config: { field, value })
 * - `assign_agent`: assigns to a specific agent (config: { agent_id })
 * - `assign_group`: assigns to a group (config: { group_id })
 * - `add_tag`: adds a tag (config: { tag })
 * - `remove_tag`: removes a tag (config: { tag })
 * - `send_notification`: queues a notification (config: { template_id, channel })
 * - `add_followup`: adds a followup note (config: { content, is_private })
 * - `change_priority`: changes priority (config: { urgency, impact })
 * - `escalate`: escalates to a group (config: { group_id })
 * - `webhook`: fires an outgoing webhook (config: { url, method, headers, body })
 *
 * NOTE: Actions that require database writes (assign, notify, etc.) mutate
 * the `context.entity` object in-place so that subsequent actions in the same
 * rule chain can see the updated values. The actual database persistence is
 * the caller's responsibility — this service only computes the mutations.
 *
 * @param action - The action to execute
 * @param context - The rule context (may be mutated)
 * @returns Execution result
 */
export async function executeAction(
  action: RuleActionInput,
  context: RuleContext,
): Promise<ActionExecutionResult> {
  try {
    switch (action.action_type) {
      case 'set_field': {
        const { field, value } = action.config as { field: string; value: unknown };
        if (!field) {
          return { action_type: action.action_type, success: false, error: 'Missing field in config' };
        }
        context.entity[field] = value;
        return {
          action_type: action.action_type,
          success: true,
          result: { field, value },
        };
      }

      case 'assign_agent': {
        const { agent_id } = action.config as { agent_id: string };
        if (!agent_id) {
          return { action_type: action.action_type, success: false, error: 'Missing agent_id in config' };
        }
        context.entity.assigned_agent_id = agent_id;
        context.entity.status = context.entity.status === 'new' ? 'assigned' : context.entity.status;
        return {
          action_type: action.action_type,
          success: true,
          result: { assigned_agent_id: agent_id },
        };
      }

      case 'assign_group': {
        const { group_id } = action.config as { group_id: string };
        if (!group_id) {
          return { action_type: action.action_type, success: false, error: 'Missing group_id in config' };
        }
        context.entity.assigned_group_id = group_id;
        context.entity.status = context.entity.status === 'new' ? 'assigned' : context.entity.status;
        return {
          action_type: action.action_type,
          success: true,
          result: { assigned_group_id: group_id },
        };
      }

      case 'add_tag': {
        const { tag } = action.config as { tag: string };
        if (!tag) {
          return { action_type: action.action_type, success: false, error: 'Missing tag in config' };
        }
        const currentTags = Array.isArray(context.entity.tags)
          ? (context.entity.tags as string[])
          : [];
        if (!currentTags.includes(tag)) {
          context.entity.tags = [...currentTags, tag];
        }
        return {
          action_type: action.action_type,
          success: true,
          result: { tag, tags: context.entity.tags },
        };
      }

      case 'remove_tag': {
        const { tag } = action.config as { tag: string };
        if (!tag) {
          return { action_type: action.action_type, success: false, error: 'Missing tag in config' };
        }
        const currentTags = Array.isArray(context.entity.tags)
          ? (context.entity.tags as string[])
          : [];
        context.entity.tags = currentTags.filter((t) => t !== tag);
        return {
          action_type: action.action_type,
          success: true,
          result: { tag, tags: context.entity.tags },
        };
      }

      case 'send_notification': {
        const { template_id, channel } = action.config as {
          template_id?: string;
          channel?: string;
        };
        // Notification is queued — the caller is responsible for persisting
        // the notification_queue entry with the returned config.
        return {
          action_type: action.action_type,
          success: true,
          result: {
            queued: true,
            template_id: template_id ?? null,
            channel: channel ?? 'in_app',
            tenant_id: context.tenant_id,
          },
        };
      }

      case 'add_followup': {
        const { content, is_private } = action.config as {
          content: string;
          is_private?: boolean;
        };
        if (!content) {
          return { action_type: action.action_type, success: false, error: 'Missing content in config' };
        }
        return {
          action_type: action.action_type,
          success: true,
          result: {
            queued: true,
            content,
            is_private: is_private ?? false,
            entity_id: context.entity.id as string,
          },
        };
      }

      case 'change_priority': {
        const { urgency, impact } = action.config as {
          urgency?: string;
          impact?: string;
        };
        if (urgency) {
          context.entity.urgency = urgency;
        }
        if (impact) {
          context.entity.impact = impact;
        }
        return {
          action_type: action.action_type,
          success: true,
          result: { urgency, impact },
        };
      }

      case 'escalate': {
        const { group_id } = action.config as { group_id: string };
        if (!group_id) {
          return { action_type: action.action_type, success: false, error: 'Missing group_id in config' };
        }
        context.entity.assigned_group_id = group_id;
        context.entity.assigned_agent_id = null;
        return {
          action_type: action.action_type,
          success: true,
          result: { escalated_to_group: group_id },
        };
      }

      case 'webhook': {
        const { url, method, headers, body } = action.config as {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: unknown;
        };
        if (!url) {
          return { action_type: action.action_type, success: false, error: 'Missing url in config' };
        }

        try {
          const response = await fetch(url, {
            method: method ?? 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(headers ?? {}),
            },
            body: body ? JSON.stringify(body) : JSON.stringify(context.entity),
            signal: AbortSignal.timeout(10_000), // 10s timeout
          });

          return {
            action_type: action.action_type,
            success: response.ok,
            result: { status: response.status, url },
            error: response.ok ? undefined : `Webhook returned ${response.status}`,
          };
        } catch (fetchErr) {
          return {
            action_type: action.action_type,
            success: false,
            error: fetchErr instanceof Error ? fetchErr.message : 'Webhook request failed',
          };
        }
      }

      default:
        return {
          action_type: action.action_type,
          success: false,
          error: `Unknown action type: ${action.action_type}`,
        };
    }
  } catch (err) {
    return {
      action_type: action.action_type,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error executing action',
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves a nested value from an object using dot notation.
 * Example: getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}
