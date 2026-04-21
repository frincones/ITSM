import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:privacyPolicy'),
    description: t('marketing:privacyPolicyDescription'),
  };
}

async function PrivacyPolicyPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t('marketing:privacyPolicy')}
        subtitle={t('marketing:privacyPolicyDescription')}
      />

      <div className={'container mx-auto py-12'}>
        <article className={'prose prose-slate dark:prose-invert mx-auto max-w-3xl'}>
          <p className={'text-muted-foreground text-sm'}>
            Last updated: April 21, 2026
          </p>

          <p>
            TDX TRANSFORMACION DIGITAL S.A.S. (&ldquo;TDX&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;, or &ldquo;our&rdquo;), operator of NovaDesk ITSM
            (the &ldquo;Service&rdquo;), is committed to protecting the privacy
            of its users and customers. This Privacy Policy describes how we
            collect, use, store, share, and protect personal data in accordance
            with Colombian Law 1581 of 2012, Decree 1377 of 2013, the European
            Union General Data Protection Regulation (GDPR), and the California
            Consumer Privacy Act (CCPA), as applicable.
          </p>

          <h2>1. Data Controller</h2>
          <ul>
            <li>
              <strong>Legal name:</strong> TDX TRANSFORMACION DIGITAL S.A.S.
            </li>
            <li>
              <strong>Tax ID (NIT):</strong> 901.650.655-0
            </li>
            <li>
              <strong>Address:</strong> Calle 61 #56-51, Medellín, Colombia
            </li>
            <li>
              <strong>Phone:</strong> +57 315 304 1548
            </li>
            <li>
              <strong>Data Protection contact:</strong> privacy@tdxcore.com
            </li>
          </ul>

          <h2>2. Information We Collect</h2>
          <p>We collect the following categories of personal data:</p>
          <ul>
            <li>
              <strong>Account data:</strong> name, email, password (hashed),
              profile picture, language, time zone, and role inside your
              workspace.
            </li>
            <li>
              <strong>Organization data:</strong> company name, workspace URL,
              subscription plan, and billing information.
            </li>
            <li>
              <strong>Service usage data:</strong> tickets, messages, uploaded
              attachments, knowledge base articles, workflows, and any content
              you or your end-users submit through the Service.
            </li>
            <li>
              <strong>Technical data:</strong> IP address, browser type, device
              identifiers, pages visited, and timestamps (collected via cookies
              and server logs).
            </li>
            <li>
              <strong>AI interaction data:</strong> prompts and conversations
              submitted to our AI agents, used only to produce responses and
              improve the Service. We do not use your data to train third-party
              foundation models.
            </li>
            <li>
              <strong>Billing data:</strong> payment method tokens, invoices,
              and transaction history. Full card numbers are never stored by us;
              they are handled by our PCI-DSS-compliant payment processors.
            </li>
          </ul>

          <h2>3. Purpose of Processing</h2>
          <p>We use personal data to:</p>
          <ol>
            <li>Provide, maintain, and improve the Service.</li>
            <li>Authenticate users and enforce role-based access controls.</li>
            <li>Process subscriptions, payments, refunds, and invoicing.</li>
            <li>
              Send service-related communications (security alerts, billing
              notices, feature updates).
            </li>
            <li>
              Provide AI-powered features such as ticket classification, reply
              suggestions, and knowledge search.
            </li>
            <li>Detect, prevent, and respond to fraud, abuse, and security incidents.</li>
            <li>Comply with applicable laws, regulations, and lawful requests.</li>
          </ol>

          <h2>4. Legal Basis</h2>
          <p>
            We process personal data based on: (a) your consent, where required;
            (b) the performance of a contract with you or your organization; (c)
            our legitimate interests in operating and securing the Service; and
            (d) compliance with a legal obligation.
          </p>

          <h2>5. Data Sharing and Subprocessors</h2>
          <p>
            We do not sell your personal data. We share data with trusted
            subprocessors under written data-protection agreements, strictly for
            the purposes listed above:
          </p>
          <ul>
            <li>
              <strong>Supabase Inc.</strong> — database, authentication, and
              file storage (United States).
            </li>
            <li>
              <strong>Vercel Inc.</strong> — application hosting and edge
              infrastructure (United States, global CDN).
            </li>
            <li>
              <strong>Anthropic PBC</strong> — AI model inference (Claude).
            </li>
            <li>
              <strong>OpenAI, L.L.C.</strong> — embeddings for semantic search
              (RAG).
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery.
            </li>
            <li>
              <strong>Payment processor</strong> (Paddle, Stripe, or equivalent
              Merchant of Record) — subscription billing and tax compliance.
            </li>
          </ul>

          <h2>6. International Transfers</h2>
          <p>
            Personal data may be transferred to and processed in countries
            outside Colombia, including the United States and the European
            Union. We rely on Standard Contractual Clauses and equivalent
            safeguards to ensure an adequate level of protection consistent
            with Colombian Law 1581 of 2012.
          </p>

          <h2>7. Your Rights</h2>
          <p>
            You have the right to: (a) access your personal data; (b) rectify
            inaccurate data; (c) request deletion (&ldquo;right to be forgotten&rdquo;);
            (d) object to or restrict processing; (e) data portability; and (f)
            withdraw consent at any time. To exercise any of these rights, email{' '}
            <a href="mailto:privacy@tdxcore.com">privacy@tdxcore.com</a>. We
            will respond within 15 business days, as required by Colombian law.
          </p>

          <h2>8. Data Retention</h2>
          <p>
            We retain personal data for as long as your account is active, plus
            the retention periods required by applicable tax, accounting, and
            legal obligations (typically 5–10 years for invoices and
            transactional records). You may request earlier deletion at any
            time, subject to legal retention requirements.
          </p>

          <h2>9. Security Measures</h2>
          <p>
            We protect your data with industry-standard controls, including:
            encryption in transit (TLS 1.2+) and at rest (AES-256), PostgreSQL
            Row Level Security for multi-tenant isolation, password hashing
            with bcrypt, session cookies marked HttpOnly/Secure/SameSite, MFA
            support, audit logs, least-privilege access, and continuous
            vulnerability monitoring.
          </p>

          <h2>10. Cookies</h2>
          <p>
            For details on cookies and similar technologies, please read our{' '}
            <a href="/cookie-policy">Cookie Policy</a>.
          </p>

          <h2>11. Minors</h2>
          <p>
            NovaDesk is a business-to-business product and is not directed to
            children under 18. We do not knowingly collect personal data from
            minors.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be announced via email and/or an in-product banner at
            least 15 days before they take effect.
          </p>

          <h2>13. Contact</h2>
          <p>
            For privacy-related questions, complaints, or to exercise your
            rights, contact us at{' '}
            <a href="mailto:privacy@tdxcore.com">privacy@tdxcore.com</a> or by
            postal mail at the address listed above.
          </p>
        </article>
      </div>
    </div>
  );
}

export default withI18n(PrivacyPolicyPage);
