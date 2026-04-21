import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:cookiePolicy'),
    description: t('marketing:cookiePolicyDescription'),
  };
}

async function CookiePolicyPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t(`marketing:cookiePolicy`)}
        subtitle={t(`marketing:cookiePolicyDescription`)}
      />

      <div className={'container mx-auto py-12'}>
        <article className={'prose prose-slate dark:prose-invert mx-auto max-w-3xl'}>
          <p className={'text-muted-foreground text-sm'}>
            Last updated: April 21, 2026
          </p>

          <p>
            This Cookie Policy explains how TDX TRANSFORMACION DIGITAL S.A.S.
            (NIT 901.650.655-0), operator of NovaDesk ITSM, uses cookies and
            similar technologies on our websites and web application. It
            complements our <a href="/privacy-policy">Privacy Policy</a>.
          </p>

          <h2>1. What are cookies?</h2>
          <p>
            Cookies are small text files stored on your device when you visit a
            website. They allow the site to recognize your browser, remember
            preferences, and keep you signed in. We also use similar
            technologies such as local storage and pixel tags; we call all of
            them &ldquo;cookies&rdquo; in this policy for simplicity.
          </p>

          <h2>2. Categories of cookies we use</h2>

          <h3>Strictly necessary</h3>
          <p>
            Required for the Service to function. You cannot disable these
            without breaking the site.
          </p>
          <ul>
            <li>
              <strong>Authentication</strong> (Supabase session) — keeps you
              signed in. HttpOnly, Secure, SameSite=Lax.
            </li>
            <li>
              <strong>CSRF token</strong> — protects against cross-site
              request forgery.
            </li>
            <li>
              <strong>Tenant routing</strong> — routes requests to the correct
              workspace.
            </li>
          </ul>

          <h3>Preferences</h3>
          <p>Remember choices you have made, such as language and theme.</p>
          <ul>
            <li>
              <strong>Locale</strong> — stores your preferred interface
              language.
            </li>
            <li>
              <strong>Theme</strong> — stores light/dark/system preference.
            </li>
          </ul>

          <h3>Analytics (optional)</h3>
          <p>
            Help us understand how users interact with NovaDesk so we can
            improve it. Aggregated and anonymized when possible. Enabled only
            after you accept the cookie banner, where applicable by law.
          </p>
          <ul>
            <li>Page views, feature usage, funnel drop-off points.</li>
            <li>Performance metrics (page load time, errors).</li>
          </ul>

          <h3>Marketing</h3>
          <p>
            We do not currently use third-party advertising cookies. If this
            changes we will update this policy and request consent where
            required.
          </p>

          <h2>3. Third parties</h2>
          <p>
            Some cookies are set by our subprocessors to deliver the Service:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — authentication session cookies.
            </li>
            <li>
              <strong>Vercel</strong> — edge routing and deployment protection.
            </li>
            <li>
              <strong>Payment processor</strong> — when you go through
              checkout, the processor may set cookies for fraud prevention and
              session management.
            </li>
          </ul>

          <h2>4. How to manage cookies</h2>
          <p>
            You can accept, refuse, or delete cookies through your browser
            settings. Most browsers allow you to block third-party cookies or
            clear cookies for a specific site. Note that disabling strictly
            necessary cookies will prevent you from signing in and using the
            Service.
          </p>
          <p>
            Where we show a cookie banner, you can change your choice at any
            time by clicking &ldquo;Cookie preferences&rdquo; in the footer.
          </p>

          <h2>5. Changes</h2>
          <p>
            We may update this Cookie Policy when we add or remove cookies.
            Material changes will be announced via an in-product banner.
          </p>

          <h2>6. Contact</h2>
          <p>
            Questions about this policy? Email{' '}
            <a href="mailto:privacy@tdxcore.com">privacy@tdxcore.com</a>.
          </p>
        </article>
      </div>
    </div>
  );
}

export default withI18n(CookiePolicyPage);
