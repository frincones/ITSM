import { SignInMethodsContainer } from '@kit/auth/sign-in';
import { Heading } from '@kit/ui/heading';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

import { SignInBrandingPanel } from './_components/sign-in-branding-panel';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();

  return {
    title: i18n.t('auth:signIn'),
  };
};

const paths = {
  callback: pathsConfig.auth.callback,
  home: pathsConfig.app.home,
};

function SignInPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left Side - Branding */}
      <SignInBrandingPanel />

      {/* Right Side - Login Form */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 dark:bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-foreground">
              NovaDesk ITSM
            </span>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-card">
            <div className="mb-8">
              <Heading level={4} className="mb-2 tracking-tight">
                Welcome back
              </Heading>
              <p className="text-sm text-muted-foreground">
                Sign in to your account to continue
              </p>
            </div>

            <SignInMethodsContainer
              paths={paths}
              providers={authConfig.providers}
            />
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <a
              href="#"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="#"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default withI18n(SignInPage);
