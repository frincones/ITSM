import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { withI18n } from '~/lib/i18n/with-i18n';

import { SetPasswordForm } from './_components/set-password-form';

export const generateMetadata = async () => ({
  title: 'Configurar contraseña',
});

async function SetPasswordPage() {
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const isTemporary = user.user_metadata?.password_temporary === true;
  if (!isTemporary) {
    redirect('/home');
  }

  return <SetPasswordForm userEmail={user.email ?? ''} />;
}

export default withI18n(SetPasswordPage);
