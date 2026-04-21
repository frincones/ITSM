import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:termsOfService'),
    description: t('marketing:termsOfServiceDescription'),
  };
}

async function TermsOfServicePage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t(`marketing:termsOfService`)}
        subtitle={t(`marketing:termsOfServiceDescription`)}
      />

      <div className={'container mx-auto py-12'}>
        <article className={'prose prose-slate dark:prose-invert mx-auto max-w-3xl'}>
          <p className={'text-muted-foreground text-sm'}>
            Last updated: April 21, 2026
          </p>

          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
            and use of NovaDesk ITSM (the &ldquo;Service&rdquo;), provided by
            TDX TRANSFORMACION DIGITAL S.A.S., a Colombian simplified
            joint-stock company with Tax ID (NIT) 901.650.655-0 and registered
            office at Calle 61 #56-51, Medellín, Colombia (&ldquo;TDX&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account,
            subscribing, or otherwise using the Service, you agree to be bound
            by these Terms.
          </p>

          <h2>1. The Service</h2>
          <p>
            NovaDesk ITSM is a cloud-based IT Service Management platform that
            includes ticketing, knowledge base, problem and change management,
            workflow automation, AI-assisted operations, and customer portal
            features. The Service is provided on a subscription basis.
          </p>

          <h2>2. Eligibility and Account</h2>
          <p>
            You must be at least 18 years old and legally capable of entering
            into contracts to use the Service. You are responsible for all
            activity that occurs under your account and for safeguarding your
            credentials. You must notify us promptly at
            support@tdxcore.com of any unauthorized access or security
            incident.
          </p>

          <h2>3. Subscriptions, Plans, and Billing</h2>
          <ul>
            <li>
              Prices are displayed in US Dollars (USD) on our{' '}
              <a href="/pricing">Pricing page</a> and may be adjusted with at
              least 30 days&apos; notice for existing subscriptions.
            </li>
            <li>
              Subscriptions renew automatically at the end of each billing
              period unless canceled before renewal.
            </li>
            <li>
              Applicable taxes (VAT, sales tax, IVA) are added at checkout or
              handled by our Merchant of Record, where applicable.
            </li>
            <li>
              Upgrades take effect immediately with prorated billing.
              Downgrades take effect at the end of the current billing period.
            </li>
          </ul>

          <h2>4. Free Plan</h2>
          <p>
            The Free plan is provided &ldquo;as is&rdquo; for evaluation and
            small teams, subject to usage limits (agents, tickets, AI
            Resolutions). We may modify, restrict, or discontinue the Free plan
            at any time with reasonable notice.
          </p>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Use the Service to store, send, or process unlawful, defamatory,
              harassing, infringing, or otherwise harmful content.
            </li>
            <li>
              Reverse-engineer, decompile, or attempt to derive the source code
              of the Service, except to the extent permitted by mandatory law.
            </li>
            <li>
              Use automated means (scrapers, bots) to access the Service other
              than through the documented public API, subject to its rate
              limits.
            </li>
            <li>
              Resell, sublicense, or white-label the Service without prior
              written authorization (Enterprise plans only).
            </li>
            <li>
              Attempt to circumvent security features, bypass usage limits, or
              interfere with other users&apos; use of the Service.
            </li>
          </ul>

          <h2>6. Customer Data</h2>
          <p>
            You retain all rights, title, and interest in the data you submit
            to the Service (&ldquo;Customer Data&rdquo;). You grant TDX a
            limited, worldwide, non-exclusive license to host, process, and
            display Customer Data solely to provide and improve the Service.
            We will process personal data in accordance with our{' '}
            <a href="/privacy-policy">Privacy Policy</a>.
          </p>

          <h2>7. Intellectual Property</h2>
          <p>
            The Service, including software, design, trademarks, and
            documentation, is owned by TDX and its licensors and is protected
            by copyright, trademark, and other intellectual property laws. No
            rights are granted except those expressly set out in these Terms.
          </p>

          <h2>8. AI Features</h2>
          <p>
            The Service includes AI-powered features that generate outputs
            based on Customer Data and third-party foundation models. AI
            outputs may be inaccurate or incomplete; you are responsible for
            reviewing and validating them before acting. We do not use your
            Customer Data to train third-party foundation models.
          </p>

          <h2>9. Service Level</h2>
          <p>
            We target an uptime of 99.5% for paid plans and 99.9% for
            Enterprise plans, measured monthly, excluding scheduled maintenance
            and causes beyond our reasonable control. Specific SLA credits, if
            any, are defined in the applicable order form.
          </p>

          <h2>10. Support</h2>
          <p>
            Support is provided via{' '}
            <a href="mailto:support@tdxcore.com">support@tdxcore.com</a>.
            Response times depend on the plan (community for Free, business
            hours for Starter/Pro, dedicated for Enterprise).
          </p>

          <h2>11. Refunds and Cancellation</h2>
          <p>
            Our refund terms are described in our{' '}
            <a href="/refund-policy">Refund Policy</a>. You may cancel your
            subscription at any time from the billing page; the subscription
            will remain active until the end of the current billing period.
          </p>

          <h2>12. Suspension and Termination</h2>
          <p>
            We may suspend or terminate your access if you materially breach
            these Terms, fail to pay, or engage in conduct that risks harm to
            other users, the Service, or third parties. Upon termination, your
            right to use the Service ends immediately; you will be able to
            export your Customer Data for 30 days before deletion.
          </p>

          <h2>13. Disclaimer</h2>
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS
            OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY
            LAW.
          </p>

          <h2>14. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, TDX&apos;S
            AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS WILL
            NOT EXCEED THE AMOUNTS PAID BY YOU TO TDX IN THE 12 MONTHS
            PRECEDING THE EVENT GIVING RISE TO THE CLAIM. TDX WILL NOT BE
            LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.
          </p>

          <h2>15. Indemnification</h2>
          <p>
            You agree to defend and indemnify TDX against any claims arising
            from your breach of these Terms, your violation of applicable laws,
            or your Customer Data.
          </p>

          <h2>16. Changes to the Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will
            be announced at least 30 days in advance. Continued use of the
            Service after the effective date constitutes acceptance.
          </p>

          <h2>17. Governing Law and Jurisdiction</h2>
          <p>
            These Terms are governed by the laws of the Republic of Colombia.
            Any dispute not resolved amicably will be submitted to the
            competent courts of Medellín, Antioquia, Colombia, without
            prejudice to any mandatory consumer protection rights you may have
            in your country of residence.
          </p>

          <h2>18. Contact</h2>
          <p>
            Questions about these Terms can be directed to{' '}
            <a href="mailto:hello@tdxcore.com">hello@tdxcore.com</a> or by
            postal mail at the address listed above.
          </p>
        </article>
      </div>
    </div>
  );
}

export default withI18n(TermsOfServicePage);
