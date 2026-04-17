import { withI18n } from '~/lib/i18n/with-i18n';

import { ActivateClient } from './_components/activate-client';

export const generateMetadata = async () => ({
  title: 'Activar cuenta',
});

interface ActivatePageProps {
  searchParams: Promise<{ email?: string }>;
}

async function ActivatePage({ searchParams }: ActivatePageProps) {
  const { email } = await searchParams;

  return <ActivateClient email={email ?? ''} />;
}

export default withI18n(ActivatePage);
