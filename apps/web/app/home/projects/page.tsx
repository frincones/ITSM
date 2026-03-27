import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ProjectsClient } from './_components/projects-client';

export const metadata = {
  title: 'Projects',
};

export default async function ProjectsPage() {
  const client = getSupabaseServerClient();

  // Fetch projects
  const { data: projects } = await client
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  return <ProjectsClient projects={projects ?? []} />;
}
