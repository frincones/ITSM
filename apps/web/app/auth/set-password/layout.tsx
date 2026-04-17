import { AuthLayoutShell } from '@kit/auth/shared';

import { AppLogo } from '~/components/app-logo';

export default function SetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayoutShell Logo={AppLogo}>{children}</AuthLayoutShell>;
}
