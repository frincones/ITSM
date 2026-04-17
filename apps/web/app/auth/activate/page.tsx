import { AuthLayoutShell } from '@kit/auth/shared';

import { AppLogo } from '~/components/app-logo';
import { withI18n } from '~/lib/i18n/with-i18n';

import { ActivateClient } from './_components/activate-client';

export const generateMetadata = async () => ({
  title: 'Activar cuenta',
});

const Logo = () => <AppLogo href={''} />;

interface ActivatePageProps {
  searchParams: Promise<{ email?: string }>;
}

async function ActivatePage({ searchParams }: ActivatePageProps) {
  const { email } = await searchParams;

  return (
    <AuthLayoutShell Logo={Logo}>
      <ActivateClient email={email ?? ''} />
    </AuthLayoutShell>
  );
}

export default withI18n(ActivatePage);
