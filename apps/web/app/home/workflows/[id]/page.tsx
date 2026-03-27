import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { WorkflowBuilderClient } from './_components/workflow-builder-client';

export const metadata = {
  title: 'Workflow Builder',
};

export interface WorkflowStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  order_index: number;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  steps: WorkflowStep[];
}

interface WorkflowBuilderPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowBuilderPage({
  params,
}: WorkflowBuilderPageProps) {
  const { id } = await params;
  const client = getSupabaseServerClient();

  let workflow: WorkflowDetail | null = null;

  try {
    const { data } = await client
      .from('workflows')
      .select(
        `
        id,
        name,
        description,
        trigger_type,
        is_active,
        workflow_steps (
          id,
          type,
          name,
          config,
          position_x,
          position_y,
          order_index
        )
      `,
      )
      .eq('id', id)
      .single();

    if (data) {
      const steps: WorkflowStep[] = (
        (data as Record<string, unknown>).workflow_steps as Array<{
          id: string;
          type: string;
          name: string;
          config: Record<string, unknown>;
          position_x: number;
          position_y: number;
          order_index: number;
        }> ?? []
      )
        .sort((a, b) => a.order_index - b.order_index)
        .map((s) => ({
          id: s.id,
          type: s.type as WorkflowStep['type'],
          name: s.name,
          config: s.config ?? {},
          position: { x: s.position_x ?? 100, y: s.position_y ?? 100 },
          order_index: s.order_index,
        }));

      workflow = {
        id: data.id,
        name: data.name,
        description: data.description,
        trigger_type: data.trigger_type,
        is_active: data.is_active,
        steps,
      };
    }
  } catch {
    // Fallback when table doesn't exist yet
  }

  // Fallback workflow for development
  const fallbackWorkflow: WorkflowDetail = {
    id,
    name: 'Critical Ticket Auto-Routing',
    description:
      'Automatically route critical priority tickets to the appropriate team',
    trigger_type: 'ticket.created',
    is_active: true,
    steps: [
      {
        id: '1',
        type: 'trigger',
        name: 'Ticket Created',
        config: { event: 'ticket.created' },
        position: { x: 100, y: 100 },
        order_index: 0,
      },
      {
        id: '2',
        type: 'condition',
        name: 'Priority = Critical?',
        config: {
          field: 'priority',
          operator: 'equals',
          value: 'critical',
        },
        position: { x: 100, y: 220 },
        order_index: 1,
      },
      {
        id: '3',
        type: 'action',
        name: 'Assign to Network Team',
        config: { action: 'assign_group', group_id: 'network-team' },
        position: { x: 100, y: 340 },
        order_index: 2,
      },
      {
        id: '4',
        type: 'action',
        name: 'Send Email Notification',
        config: { action: 'send_email', template: 'critical_alert' },
        position: { x: 100, y: 460 },
        order_index: 3,
      },
    ],
  };

  return <WorkflowBuilderClient workflow={workflow ?? fallbackWorkflow} />;
}
