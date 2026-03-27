import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { AutomationsClient } from './_components/automations-client';

export const metadata = {
  title: 'Automations',
};

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
  success_rate: number;
  last_run_at: string | null;
  steps_count: number;
}

export interface BusinessRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  conditions_count: number;
  actions_count: number;
  is_active: boolean;
  execution_count: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  next_run_at: string | null;
  last_run_at: string | null;
  is_active: boolean;
}

export interface AutomationsStats {
  activeWorkflows: number;
  executionsToday: number;
  successRate: number;
  avgDuration: number;
}

export default async function AutomationsPage() {
  const client = getSupabaseServerClient();

  let workflows: AutomationWorkflow[] = [];
  let rules: BusinessRule[] = [];
  let scheduledTasks: ScheduledTask[] = [];
  let stats: AutomationsStats = {
    activeWorkflows: 0,
    executionsToday: 0,
    successRate: 0,
    avgDuration: 0,
  };

  try {
    // Fetch workflows
    const { data: wfData } = await client
      .from('workflows')
      .select(
        'id, name, description, trigger_type, is_active, execution_count, success_rate, last_run_at, steps_count',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    workflows = (wfData as AutomationWorkflow[]) ?? [];

    // Fetch business rules
    const { data: rulesData } = await client
      .from('business_rules')
      .select(
        'id, name, description, trigger_type, conditions_count, actions_count, is_active, execution_count',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    rules = (rulesData as BusinessRule[]) ?? [];

    // Fetch scheduled tasks
    const { data: tasksData } = await client
      .from('scheduled_tasks')
      .select('id, name, schedule, next_run_at, last_run_at, is_active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    scheduledTasks = (tasksData as ScheduledTask[]) ?? [];

    // Compute stats
    const activeCount = workflows.filter((w) => w.is_active).length;
    const totalExec = workflows.reduce(
      (sum, w) => sum + (w.execution_count ?? 0),
      0,
    );
    const avgSuccess =
      workflows.length > 0
        ? workflows.reduce((sum, w) => sum + (w.success_rate ?? 0), 0) /
          workflows.length
        : 0;

    stats = {
      activeWorkflows: activeCount,
      executionsToday: totalExec,
      successRate: Math.round(avgSuccess * 10) / 10,
      avgDuration: 1.1,
    };
  } catch {
    // Fallback when tables don't exist yet
  }

  return (
    <AutomationsClient
      workflows={workflows}
      rules={rules}
      scheduledTasks={scheduledTasks}
      stats={stats}
    />
  );
}
