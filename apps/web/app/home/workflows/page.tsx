import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { WorkflowsListClient } from './_components/workflows-list-client';

export const metadata = {
  title: 'Workflows',
};

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
  success_rate: number;
  last_run_at: string | null;
  steps_count: number;
  created_at: string;
}

export default async function WorkflowsPage() {
  const client = getSupabaseServerClient();

  let workflows: WorkflowListItem[] = [];

  try {
    const { data } = await client
      .from('workflows')
      .select(
        'id, name, description, trigger_type, is_active, execution_count, success_rate, last_run_at, steps_count, created_at',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    workflows = (data as WorkflowListItem[]) ?? [];
  } catch {
    // Fallback when table doesn't exist yet
  }

  return <WorkflowsListClient workflows={workflows} />;
}
