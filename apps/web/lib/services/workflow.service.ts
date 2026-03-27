// ---------------------------------------------------------------------------
// Workflow Engine — Business Logic Service
// ---------------------------------------------------------------------------
// Pure business logic. No 'use server' — used by Server Actions, cron jobs,
// and API routes.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  type: 'condition' | 'action' | 'delay' | 'ai_decision' | 'human_approval' | 'webhook';
  config: Record<string, unknown>;
  next_step_id: string | null;
  false_step_id: string | null;
}

interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  steps: WorkflowStep[];
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  tenant_id: string;
  trigger_resource_type: string;
  trigger_resource_id: string;
  status: 'running' | 'completed' | 'failed' | 'waiting' | 'cancelled';
  current_step_id: string | null;
  context: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

interface StepExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  /** For condition steps, indicates which branch to take. */
  condition_result?: boolean;
  /** For delay steps, the timestamp to resume at. */
  resume_at?: string;
  /** For human_approval steps, signals execution should pause. */
  requires_approval?: boolean;
}

export interface WorkflowContext {
  entity: Record<string, unknown>;
  tenant_id: string;
  previous?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. findMatchingWorkflows
// ---------------------------------------------------------------------------

/**
 * Finds all active workflows that match the given trigger type for a tenant.
 * Optionally narrows by trigger_config filters matching the context.
 */
export async function findMatchingWorkflows(
  client: SupabaseClient,
  tenantId: string,
  triggerType: string,
  _context: WorkflowContext,
): Promise<Workflow[]> {
  const { data: workflows, error } = await client
    .from('workflows')
    .select('id, tenant_id, name, trigger_type, trigger_config, is_active')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !workflows) {
    return [];
  }

  // Load steps for each matching workflow
  const results: Workflow[] = [];

  for (const wf of workflows) {
    const { data: steps } = await client
      .from('workflow_steps')
      .select('id, workflow_id, step_order, name, type, config, next_step_id, false_step_id')
      .eq('workflow_id', wf.id)
      .order('step_order', { ascending: true });

    results.push({
      ...wf,
      trigger_config: (wf.trigger_config as Record<string, unknown>) ?? {},
      steps: (steps ?? []) as WorkflowStep[],
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. executeWorkflow
// ---------------------------------------------------------------------------

/**
 * Creates a workflow execution record and processes steps sequentially
 * starting from the first step (lowest step_order).
 */
export async function executeWorkflow(
  client: SupabaseClient,
  workflowId: string,
  triggerResourceType: string,
  triggerResourceId: string,
  context: WorkflowContext,
): Promise<{ execution_id: string; status: string; error?: string }> {
  // Load workflow with steps
  const { data: workflow } = await client
    .from('workflows')
    .select('id, tenant_id, name, trigger_type, trigger_config, is_active')
    .eq('id', workflowId)
    .single();

  if (!workflow) {
    return { execution_id: '', status: 'failed', error: 'Workflow not found' };
  }

  const { data: steps } = await client
    .from('workflow_steps')
    .select('id, workflow_id, step_order, name, type, config, next_step_id, false_step_id')
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true });

  if (!steps || steps.length === 0) {
    return { execution_id: '', status: 'failed', error: 'Workflow has no steps' };
  }

  // Create execution record
  const { data: execution, error: execError } = await client
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      tenant_id: context.tenant_id,
      trigger_resource_type: triggerResourceType,
      trigger_resource_id: triggerResourceId,
      status: 'running',
      context: context.entity,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (execError || !execution) {
    return { execution_id: '', status: 'failed', error: execError?.message ?? 'Failed to create execution' };
  }

  const typedSteps = steps as WorkflowStep[];
  const exec = execution as unknown as WorkflowExecution;

  // Process steps starting from the first one
  let currentStep: WorkflowStep | undefined = typedSteps[0];

  while (currentStep) {
    const startTime = Date.now();

    try {
      const result = await executeStep(client, exec, currentStep, context);
      const durationMs = Date.now() - startTime;

      await logStepExecution(
        client,
        exec.id,
        currentStep.id,
        result.success ? 'completed' : 'failed',
        { config: currentStep.config, context: context.entity },
        result.output,
        durationMs,
      );

      // Handle delay — pause execution
      if (result.resume_at) {
        await client
          .from('workflow_executions')
          .update({
            status: 'waiting',
            current_step_id: currentStep.next_step_id,
            context: context.entity,
          })
          .eq('id', exec.id);

        return { execution_id: exec.id, status: 'waiting' };
      }

      // Handle human_approval — pause execution
      if (result.requires_approval) {
        await client
          .from('workflow_executions')
          .update({
            status: 'waiting',
            current_step_id: currentStep.next_step_id,
            context: context.entity,
          })
          .eq('id', exec.id);

        return { execution_id: exec.id, status: 'waiting' };
      }

      if (!result.success) {
        await client
          .from('workflow_executions')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            context: context.entity,
          })
          .eq('id', exec.id);

        return { execution_id: exec.id, status: 'failed', error: 'Step failed' };
      }

      // Determine next step
      if (currentStep.type === 'condition') {
        const nextId = result.condition_result
          ? currentStep.next_step_id
          : currentStep.false_step_id;

        currentStep = nextId
          ? typedSteps.find((s) => s.id === nextId)
          : undefined;
      } else {
        currentStep = currentStep.next_step_id
          ? typedSteps.find((s) => s.id === currentStep!.next_step_id)
          : undefined;
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;

      await logStepExecution(
        client,
        exec.id,
        currentStep.id,
        'failed',
        { config: currentStep.config },
        { error: err instanceof Error ? err.message : 'Unknown error' },
        durationMs,
      );

      await client
        .from('workflow_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          context: context.entity,
        })
        .eq('id', exec.id);

      return { execution_id: exec.id, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // All steps completed
  await client
    .from('workflow_executions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      context: context.entity,
    })
    .eq('id', exec.id);

  return { execution_id: exec.id, status: 'completed' };
}

// ---------------------------------------------------------------------------
// 3. executeStep
// ---------------------------------------------------------------------------

/**
 * Executes a single workflow step based on its type.
 */
export async function executeStep(
  client: SupabaseClient,
  execution: WorkflowExecution,
  step: WorkflowStep,
  context: WorkflowContext,
): Promise<StepExecutionResult> {
  switch (step.type) {
    // ----- CONDITION -----
    case 'condition': {
      const { field, operator, value } = step.config as {
        field: string;
        operator: string;
        value: unknown;
      };

      if (!field || !operator) {
        return { success: false, output: { error: 'Missing field or operator in condition config' } };
      }

      const fieldValue = getNestedValue(context.entity, field);
      const conditionMet = evaluateCondition(fieldValue, operator, value);

      return {
        success: true,
        output: { field, operator, value, fieldValue, result: conditionMet },
        condition_result: conditionMet,
      };
    }

    // ----- ACTION -----
    case 'action': {
      const { action_type } = step.config as { action_type: string };

      switch (action_type) {
        case 'set_field': {
          const { field, value } = step.config as { field: string; value: unknown };
          if (!field) {
            return { success: false, output: { error: 'Missing field in set_field config' } };
          }
          context.entity[field] = value;
          return { success: true, output: { action: 'set_field', field, value } };
        }

        case 'assign_agent': {
          const { agent_id } = step.config as { agent_id: string };
          if (!agent_id) {
            return { success: false, output: { error: 'Missing agent_id' } };
          }
          context.entity.assigned_agent_id = agent_id;
          if (context.entity.status === 'new') {
            context.entity.status = 'assigned';
          }
          return { success: true, output: { action: 'assign_agent', agent_id } };
        }

        case 'assign_group': {
          const { group_id } = step.config as { group_id: string };
          if (!group_id) {
            return { success: false, output: { error: 'Missing group_id' } };
          }
          context.entity.assigned_group_id = group_id;
          if (context.entity.status === 'new') {
            context.entity.status = 'assigned';
          }
          return { success: true, output: { action: 'assign_group', group_id } };
        }

        case 'send_notification': {
          const { template_id, channel, recipient_id } = step.config as {
            template_id?: string;
            channel?: string;
            recipient_id?: string;
          };

          // Queue a notification — actual sending is handled by the notification cron
          await client.from('notification_queue').insert({
            tenant_id: context.tenant_id,
            template_id: template_id ?? null,
            channel: channel ?? 'in_app',
            recipient_id: recipient_id ?? null,
            resource_type: execution.trigger_resource_type,
            resource_id: execution.trigger_resource_id,
            status: 'pending',
            payload: { workflow_execution_id: execution.id },
          });

          return {
            success: true,
            output: { action: 'send_notification', template_id, channel },
          };
        }

        case 'add_tag': {
          const { tag } = step.config as { tag: string };
          if (!tag) {
            return { success: false, output: { error: 'Missing tag' } };
          }
          const currentTags = Array.isArray(context.entity.tags)
            ? (context.entity.tags as string[])
            : [];
          if (!currentTags.includes(tag)) {
            context.entity.tags = [...currentTags, tag];
          }
          return { success: true, output: { action: 'add_tag', tag, tags: context.entity.tags } };
        }

        case 'trigger_webhook': {
          const { url, headers, body } = step.config as {
            url: string;
            headers?: Record<string, string>;
            body?: unknown;
          };
          if (!url) {
            return { success: false, output: { error: 'Missing url in trigger_webhook config' } };
          }

          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
              body: body ? JSON.stringify(body) : JSON.stringify(context.entity),
              signal: AbortSignal.timeout(10_000),
            });

            return {
              success: response.ok,
              output: { action: 'trigger_webhook', status: response.status, url },
            };
          } catch (fetchErr) {
            return {
              success: false,
              output: {
                action: 'trigger_webhook',
                error: fetchErr instanceof Error ? fetchErr.message : 'Webhook failed',
              },
            };
          }
        }

        default:
          return { success: false, output: { error: `Unknown action_type: ${action_type}` } };
      }
    }

    // ----- DELAY -----
    case 'delay': {
      const { delay_minutes } = step.config as { delay_minutes: number };
      if (!delay_minutes || delay_minutes <= 0) {
        return { success: false, output: { error: 'Invalid delay_minutes' } };
      }

      const resumeAt = new Date(Date.now() + delay_minutes * 60_000).toISOString();

      // Store the resume_at in the execution for the cron to pick up
      await client
        .from('workflow_executions')
        .update({ resume_at: resumeAt })
        .eq('id', execution.id);

      return {
        success: true,
        output: { action: 'delay', delay_minutes, resume_at: resumeAt },
        resume_at: resumeAt,
      };
    }

    // ----- AI DECISION -----
    case 'ai_decision': {
      const { prompt, model } = step.config as {
        prompt: string;
        model?: string;
      };

      if (!prompt) {
        return { success: false, output: { error: 'Missing prompt in ai_decision config' } };
      }

      try {
        // Build prompt with context
        const systemPrompt =
          'You are an ITSM workflow decision engine. Evaluate the condition and respond with ONLY a JSON object: { "result": true } or { "result": false }. Do not include any other text.';
        const userPrompt = `${prompt}\n\nContext:\n${JSON.stringify(context.entity, null, 2)}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: model ?? 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 50,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          return {
            success: false,
            output: { error: `OpenAI API returned ${response.status}` },
          };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? '';

        // Parse the AI response
        let aiResult = false;
        try {
          const parsed = JSON.parse(content);
          aiResult = Boolean(parsed.result);
        } catch {
          // If the AI returned non-JSON, treat "true" as truthy
          aiResult = content.toLowerCase().includes('true');
        }

        return {
          success: true,
          output: { action: 'ai_decision', prompt, ai_response: content, result: aiResult },
          condition_result: aiResult,
        };
      } catch (err) {
        return {
          success: false,
          output: {
            action: 'ai_decision',
            error: err instanceof Error ? err.message : 'AI decision failed',
          },
        };
      }
    }

    // ----- HUMAN APPROVAL -----
    case 'human_approval': {
      const { approver_id, message } = step.config as {
        approver_id: string;
        message?: string;
      };

      if (!approver_id) {
        return { success: false, output: { error: 'Missing approver_id' } };
      }

      // Create an in-app notification for the approver
      await client.from('notifications').insert({
        tenant_id: context.tenant_id,
        user_id: approver_id,
        title: 'Workflow Approval Required',
        body: message ?? `Approval needed for workflow execution ${execution.id}`,
        type: 'workflow_approval',
        resource_type: 'workflow_execution',
        resource_id: execution.id,
        is_read: false,
      });

      return {
        success: true,
        output: { action: 'human_approval', approver_id, message },
        requires_approval: true,
      };
    }

    // ----- WEBHOOK -----
    case 'webhook': {
      const { url, method, headers, body } = step.config as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
      };

      if (!url) {
        return { success: false, output: { error: 'Missing url in webhook config' } };
      }

      try {
        const response = await fetch(url, {
          method: method ?? 'POST',
          headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
          body: body ? JSON.stringify(body) : JSON.stringify({
            execution_id: execution.id,
            workflow_id: execution.workflow_id,
            resource_type: execution.trigger_resource_type,
            resource_id: execution.trigger_resource_id,
            context: context.entity,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        return {
          success: response.ok,
          output: {
            action: 'webhook',
            status: response.status,
            url,
            error: response.ok ? undefined : `Webhook returned ${response.status}`,
          },
        };
      } catch (fetchErr) {
        return {
          success: false,
          output: {
            action: 'webhook',
            error: fetchErr instanceof Error ? fetchErr.message : 'Webhook request failed',
          },
        };
      }
    }

    default:
      return { success: false, output: { error: `Unknown step type: ${step.type}` } };
  }
}

// ---------------------------------------------------------------------------
// 4. logStepExecution
// ---------------------------------------------------------------------------

/**
 * Logs the execution of a single workflow step to the workflow_step_logs table.
 */
export async function logStepExecution(
  client: SupabaseClient,
  executionId: string,
  stepId: string,
  status: 'completed' | 'failed' | 'skipped',
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  durationMs: number,
): Promise<void> {
  await client.from('workflow_step_logs').insert({
    execution_id: executionId,
    step_id: stepId,
    status,
    input,
    output,
    duration_ms: durationMs,
    executed_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// 5. resumeDelayedExecutions
// ---------------------------------------------------------------------------

/**
 * Finds workflow executions with status='waiting' that have passed their
 * resume_at timestamp and continues their processing from the next step.
 * Designed to be called from a Vercel cron job.
 */
export async function resumeDelayedExecutions(
  client: SupabaseClient,
): Promise<{ resumed: number; errors: string[] }> {
  const now = new Date().toISOString();

  const { data: executions, error } = await client
    .from('workflow_executions')
    .select('id, workflow_id, tenant_id, trigger_resource_type, trigger_resource_id, status, current_step_id, context')
    .eq('status', 'waiting')
    .lte('resume_at', now);

  if (error || !executions) {
    return { resumed: 0, errors: [error?.message ?? 'Failed to fetch waiting executions'] };
  }

  let resumed = 0;
  const errors: string[] = [];

  for (const exec of executions) {
    try {
      if (!exec.current_step_id) {
        // No next step — mark as completed
        await client
          .from('workflow_executions')
          .update({ status: 'completed', completed_at: now })
          .eq('id', exec.id);
        resumed++;
        continue;
      }

      const context: WorkflowContext = {
        entity: (exec.context as Record<string, unknown>) ?? {},
        tenant_id: exec.tenant_id,
      };

      // Resume the workflow from the current_step_id
      const result = await executeWorkflow(
        client,
        exec.workflow_id,
        exec.trigger_resource_type,
        exec.trigger_resource_id,
        context,
      );

      if (result.error) {
        errors.push(`Execution ${exec.id}: ${result.error}`);
      } else {
        resumed++;
      }
    } catch (err) {
      errors.push(
        `Execution ${exec.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  return { resumed, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Evaluates a condition using the given operator.
 */
function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  conditionValue: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return String(fieldValue) === String(conditionValue);
    case 'not_equals':
      return String(fieldValue) !== String(conditionValue);
    case 'contains':
      return String(fieldValue ?? '').toLowerCase().includes(String(conditionValue).toLowerCase());
    case 'not_contains':
      return !String(fieldValue ?? '').toLowerCase().includes(String(conditionValue).toLowerCase());
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
      return fieldValue === null || fieldValue === undefined || fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'regex': {
      try {
        return new RegExp(String(conditionValue), 'i').test(String(fieldValue ?? ''));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Retrieves a nested value from an object using dot notation.
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
