import { redirect } from 'next/navigation';

import { AuthLayoutShell } from '@kit/auth/shared';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { AppLogo } from '~/components/app-logo';
import { withI18n } from '~/lib/i18n/with-i18n';

import { SetPasswordForm } from './_components/set-password-form';

export const generateMetadata = async () => ({
  title: 'Configurar contraseña',
});

const Logo = () => <AppLogo href={''} />;

async function SetPasswordPage() {
  const client = getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  // If user doesn't have the temporary password flag, they shouldn't be here
  const isTemporary = user.user_metadata?.password_temporary === true;
  if (!isTemporary) {
    redirect('/home');
  }

  return (
    <AuthLayoutShell Logo={Logo}>
      <SetPasswordForm userEmail={user.email ?? ''} />
    </AuthLayoutShell>
  );
}

export default withI18n(SetPasswordPage);
