/**
 * Auth layout is a pass-through.
 * Individual auth sub-routes apply their own visual shells:
 * - sign-in: custom split-screen branding panel (Figma template)
 * - sign-up, password-reset, verify: AuthLayoutShell (centered card)
 */
function AuthLayout({ children }: React.PropsWithChildren) {
  return <>{children}</>;
}

export default AuthLayout;
