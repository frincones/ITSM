import { AuthLayoutShell } from '@kit/auth/shared';

import { AppLogo } from '~/components/app-logo';

export default function PasswordResetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayoutShell Logo={AppLogo}>{children}</AuthLayoutShell>;
}
