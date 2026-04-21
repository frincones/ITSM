import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:refundPolicy'),
    description: t('marketing:refundPolicyDescription'),
  };
}

async function RefundPolicyPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t('marketing:refundPolicy')}
        subtitle={t('marketing:refundPolicyDescription')}
      />

      <div className={'container mx-auto py-12'}>
        <article className={'prose prose-slate dark:prose-invert mx-auto max-w-3xl'}>
          <p className={'text-muted-foreground text-sm'}>
            Last updated: April 21, 2026
          </p>

          <p>
            This Refund Policy explains when and how you can obtain a refund
            for your NovaDesk ITSM subscription. It forms part of our{' '}
            <a href="/terms-of-service">Terms of Service</a>. The Service is
            operated by TDX TRANSFORMACION DIGITAL S.A.S., NIT 901.650.655-0,
            Calle 61 #56-51, Medellín, Colombia.
          </p>

          <h2>1. 14-Day Satisfaction Guarantee</h2>
          <p>
            If you are not satisfied with NovaDesk ITSM, you may request a
            <strong> full refund of your first paid invoice within 14
            calendar days</strong> of the payment date. This guarantee applies
            once per customer, to the first upgrade from a Free plan or to the
            first purchased subscription. To request a refund, email{' '}
            <a href="mailto:billing@tdxcore.com">billing@tdxcore.com</a> from
            the email registered to your account and tell us why you&apos;re
            leaving — your feedback helps us improve.
          </p>

          <h2>2. Renewals</h2>
          <p>
            Renewal invoices (monthly or annual) are <strong>not
            refundable</strong>. You are responsible for canceling your
            subscription before the renewal date if you no longer want to be
            charged. You can cancel at any time from the billing page inside
            the app, or by emailing{' '}
            <a href="mailto:billing@tdxcore.com">billing@tdxcore.com</a>.
          </p>

          <h2>3. Annual Plans</h2>
          <p>
            Annual plans purchased upfront are eligible for the 14-day
            satisfaction guarantee described in Section 1. After 14 days,
            annual plans are non-refundable, and cancellation will take effect
            at the end of the paid period.
          </p>

          <h2>4. Downgrades and Cancellations</h2>
          <ul>
            <li>
              <strong>Downgrades</strong> take effect at the end of the current
              billing period. No partial refund is issued for the unused
              portion of a higher tier.
            </li>
            <li>
              <strong>Cancellations</strong> stop future renewals. Your
              workspace remains active and accessible until the end of the
              paid period; after that it becomes read-only for 30 days so you
              can export your data.
            </li>
          </ul>

          <h2>5. Non-Refundable Items</h2>
          <p>The following are not eligible for refunds:</p>
          <ul>
            <li>
              <strong>Consumed AI Resolutions</strong> or any usage-based
              credits that have already been applied to tickets, messages, or
              automations.
            </li>
            <li>
              <strong>One-time onboarding or implementation fees</strong>{' '}
              once work has commenced.
            </li>
            <li>
              <strong>Add-ons</strong> (extra seats, custom integrations,
              premium support) after activation.
            </li>
            <li>
              Subscriptions canceled due to a breach of our{' '}
              <a href="/terms-of-service">Terms of Service</a>.
            </li>
          </ul>

          <h2>6. Service Outages</h2>
          <p>
            If you experience a verified service outage that exceeds the uptime
            commitment stated in your plan, you may be entitled to service
            credits as described in the applicable order form. Service credits
            are issued as discounts on future invoices and are not refunded in
            cash.
          </p>

          <h2>7. Currency, Taxes, and Fees</h2>
          <p>
            Refunds are issued in the original currency of the transaction
            (USD) and via the original payment method. Where the payment was
            processed by a Merchant of Record (e.g., Paddle, Polar, Stripe),
            refunds are subject to the processor&apos;s policies and timing,
            typically 5–10 business days. Payment-processor fees, currency
            conversion fees, and taxes remitted to authorities are not
            refundable to TDX and therefore will not be refunded to you.
          </p>

          <h2>8. How to Request a Refund</h2>
          <ol>
            <li>
              Email{' '}
              <a href="mailto:billing@tdxcore.com">billing@tdxcore.com</a>{' '}
              from the email registered on your account.
            </li>
            <li>
              Include your workspace name or ID and the invoice number or
              transaction reference.
            </li>
            <li>
              Briefly tell us the reason — this is optional but appreciated.
            </li>
          </ol>
          <p>
            We acknowledge refund requests within 2 business days and complete
            approved refunds within 10 business days of approval.
          </p>

          <h2>9. Chargebacks</h2>
          <p>
            If you believe a charge is incorrect, please contact us first — we
            resolve the vast majority of issues within 48 hours. Filing a
            chargeback without contacting us may result in the suspension of
            your account until the dispute is resolved.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Refund Policy from time to time. Material
            changes will be announced at least 30 days in advance and will not
            apply retroactively to payments made before the change.
          </p>

          <h2>11. Contact</h2>
          <p>
            Billing questions:{' '}
            <a href="mailto:billing@tdxcore.com">billing@tdxcore.com</a>.
            General questions:{' '}
            <a href="mailto:hello@tdxcore.com">hello@tdxcore.com</a>.
          </p>
        </article>
      </div>
    </div>
  );
}

export default withI18n(RefundPolicyPage);
