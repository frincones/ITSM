import { redirect } from 'next/navigation';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageHeader } from '@kit/ui/page';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { withI18n } from '~/lib/i18n/with-i18n';

async function UserSettingsLayout(props: React.PropsWithChildren) {
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: agent } = await client
    .from('agents')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const isPlatformAdmin =
    agent?.role === 'admin' || agent?.role === 'supervisor';

  if (!isPlatformAdmin) {
    redirect('/home');
  }

  return (
    <>
      <PageHeader description={<AppBreadcrumbs />} />
      {props.children}
    </>
  );
}

export default withI18n(UserSettingsLayout);
