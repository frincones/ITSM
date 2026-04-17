import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { SidebarNav } from './_components/sidebar-nav';
import { HomeLayoutClient } from './_components/home-layout-client';

async function HomeLayout({ children }: React.PropsWithChildren) {
  // Ensure user is authenticated; redirects to sign-in if not
  await requireUserInServerComponent();

  // Resolve allowed modules and user role for the current user
  let allowedModules: string[] | null = null;
  let userRole: 'admin' | 'agent' | 'client' = 'agent';
  try {
    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (user) {
      const { getUserAllowedModules } = await import(
        '~/lib/services/user-permissions.service'
      );
      allowedModules = await getUserAllowedModules(client, user.id);

      // Resolve role from agents table
      const { data: agentRecord } = await client
        .from('agents')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (agentRecord?.role === 'admin' || agentRecord?.role === 'supervisor') {
        userRole = 'admin';
      } else if (agentRecord?.role === 'agent') {
        userRole = 'agent';
      } else {
        userRole = 'client';
      }
    }
  } catch {
    allowedModules = null;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — icon rail (w-16) */}
      <SidebarNav allowedModules={allowedModules} />

      {/* Main Content + Topbar + AI Sidebar */}
      <HomeLayoutClient userRole={userRole}>{children}</HomeLayoutClient>
    </div>
  );
}

export default withI18n(HomeLayout);
