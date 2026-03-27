import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { SidebarNav } from './_components/sidebar-nav';
import { Topbar } from './_components/topbar';

async function HomeLayout({ children }: React.PropsWithChildren) {
  // Ensure user is authenticated; redirects to sign-in if not
  await requireUserInServerComponent();

  // Resolve allowed modules for the current user (backwards compatible)
  let allowedModules: string[] | null = null;
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
    }
  } catch {
    // If anything fails, null = all modules allowed (backwards compatible)
    allowedModules = null;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — icon rail (w-16) */}
      <SidebarNav allowedModules={allowedModules} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <Topbar />

        {/* Page Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export default withI18n(HomeLayout);
