import Link from 'next/link';

import { ArrowRightIcon, CheckIcon, SparklesIcon } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Hero, Pill } from '@kit/ui/marketing';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:pricing'),
    description: t('marketing:pricingSubtitle'),
  };
}

type Plan = {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  description: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  features: string[];
  limits: string[];
};

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    description: 'For small teams getting started with ITSM.',
    cta: { label: 'Start free', href: '/auth/sign-up' },
    features: [
      'Up to 3 agents',
      '500 tickets / month',
      '100 AI Resolutions / month',
      'Knowledge base (up to 50 articles)',
      'Customer portal (token-based)',
      'Email ingest',
      'Community support',
    ],
    limits: ['NovaDesk branding on portal'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$19',
    priceNote: 'per agent / month',
    description: 'Core ITSM for growing IT teams and MSPs.',
    cta: { label: 'Start free', href: '/auth/sign-up?plan=starter' },
    features: [
      'Everything in Free',
      'SLAs, calendars, holidays',
      'Multi-channel inbox (email + WhatsApp)',
      'Service catalog with dynamic forms',
      '5 automation workflows',
      '1 AI Agent (triage)',
      '1,000 AI Resolutions / month',
      'Custom fields + multi-language',
      'Standard reports & dashboards',
      'Email support',
    ],
    limits: ['Minimum 3 agents · Billed monthly or annually'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$49',
    priceNote: 'per agent / month',
    description: 'The complete platform for mid-market IT operations.',
    highlight: true,
    cta: { label: 'Start free', href: '/auth/sign-up?plan=professional' },
    features: [
      'Everything in Starter',
      'Problem & Change Management',
      'Unlimited workflows with AI decisions & approvals',
      'CMDB / Assets',
      'Projects + ticket linking',
      'Multi-client Organizations (MSP mode)',
      '3 AI Agents (triage, support, resolution)',
      '5,000 AI Resolutions / month',
      'Public REST API v1 + webhooks',
      'Advanced analytics + CSAT',
      'Priority support',
    ],
    limits: ['Minimum 5 agents · Billed monthly or annually'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'talk to sales',
    description:
      'Compliance, security, and scale for regulated organizations.',
    cta: { label: 'Contact sales', href: 'mailto:hello@tdxcore.com' },
    features: [
      'Everything in Professional',
      'Granular RBAC per module',
      'SSO / SAML (roadmap)',
      'Full audit logs with custom retention',
      'MFA enforcement + IP allowlist',
      'Unlimited AI Agents (8 specialized types)',
      'AI round-robin routing',
      'Custom AI Resolutions pool · overage $0.40/each',
      '99.9% uptime SLA · DPA · data residency',
      'Dedicated Customer Success Manager',
      'Sandbox environment',
    ],
    limits: ['Minimum 25 agents · Annual contract'],
  },
];

const faqs: { question: string; answer: string }[] = [
  {
    question: 'What counts as an agent?',
    answer:
      'An agent is any user who can respond to tickets, resolve incidents, or manage the platform. End-users who only submit requests through the portal are not counted as agents and do not consume a seat.',
  },
  {
    question: 'Can I change plans at any time?',
    answer:
      'Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing period. You can manage your subscription from the billing page.',
  },
  {
    question: 'What happens if I hit a limit on my plan?',
    answer:
      'You will see a notification in-app when you approach 80% of any usage limit. You can upgrade at any time, or purchase add-on packs (extra AI Resolutions, for example) without changing plans.',
  },
  {
    question: 'What is an AI Resolution?',
    answer:
      'An AI Resolution is any action completed by our AI agents — triaging a ticket, sending a reply, classifying a request, or retrieving a knowledge article. You only pay for successful outcomes.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Yes. We offer a 14-day satisfaction guarantee on your first paid invoice. See our Refund Policy for details.',
  },
  {
    question: 'Do you offer annual billing?',
    answer:
      'Yes. Annual plans save approximately 17% compared to monthly billing. You can switch to annual at any time from the billing page.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept major credit and debit cards (Visa, Mastercard, American Express), plus PayPal and local payment methods depending on your region. Enterprise customers can pay by wire transfer.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. All data is encrypted in transit (TLS 1.2+) and at rest (AES-256), isolated per tenant with PostgreSQL Row Level Security, and hosted on SOC 2-compliant infrastructure. See our Privacy Policy for full details.',
  },
];

async function PricingPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div className={'flex flex-col space-y-24 py-14'}>
      <div className={'container mx-auto'}>
        <Hero
          pill={
            <Pill label={'Pricing'}>
              <span>Simple. Transparent. Cancel anytime.</span>
            </Pill>
          }
          title={<span>{t('marketing:pricingHero')}</span>}
          subtitle={<span>{t('marketing:pricingSubhero')}</span>}
        />
      </div>

      <div className={'container mx-auto'}>
        <div className={'grid gap-6 md:grid-cols-2 xl:grid-cols-4'}>
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        <p
          className={
            'text-muted-foreground mt-8 text-center text-sm'
          }
        >
          All prices in USD. Applicable taxes are added at checkout. Annual
          billing saves approximately 17%.
        </p>
      </div>

      <div className={'container mx-auto'}>
        <div className={'mx-auto max-w-3xl text-center'}>
          <h2 className={'text-3xl font-bold tracking-tight md:text-4xl'}>
            Frequently asked questions
          </h2>
          <p className={'text-muted-foreground mt-3 text-lg'}>
            Everything you need to know before signing up.
          </p>
        </div>

        <div
          className={
            'mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2'
          }
        >
          {faqs.map((faq) => (
            <div key={faq.question} className={'space-y-2'}>
              <h3 className={'text-base font-semibold'}>{faq.question}</h3>
              <p className={'text-muted-foreground text-sm leading-relaxed'}>
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={'container mx-auto'}>
        <Card
          className={
            'from-primary/5 to-primary/10 bg-gradient-to-br border-primary/20'
          }
        >
          <CardContent className={'p-10 text-center'}>
            <h2 className={'text-2xl font-bold tracking-tight md:text-3xl'}>
              Not sure which plan fits?
            </h2>
            <p className={'text-muted-foreground mx-auto mt-3 max-w-xl'}>
              Book a 20-minute walkthrough with our team. We&apos;ll help you
              size the right plan for your volume and workflows.
            </p>
            <div
              className={'mt-6 flex flex-wrap justify-center gap-3'}
            >
              <Button asChild size={'lg'}>
                <a href={'mailto:hello@tdxcore.com'}>
                  Talk to sales
                  <ArrowRightIcon className={'ml-2 h-4 w-4'} />
                </a>
              </Button>
              <Button asChild variant={'outline'} size={'lg'}>
                <Link href={'/auth/sign-up'}>Start free</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card
      className={
        plan.highlight
          ? 'border-primary ring-primary/20 relative ring-2 shadow-lg'
          : 'relative'
      }
    >
      {plan.highlight ? (
        <Badge
          className={
            'absolute -top-3 left-1/2 -translate-x-1/2 shadow-sm'
          }
        >
          <SparklesIcon className={'mr-1 h-3 w-3'} />
          Most popular
        </Badge>
      ) : null}

      <CardContent className={'flex h-full flex-col gap-6 p-6'}>
        <div>
          <h3 className={'text-xl font-semibold'}>{plan.name}</h3>
          <p className={'text-muted-foreground mt-1 text-sm'}>
            {plan.description}
          </p>
        </div>

        <div>
          <div className={'flex items-baseline gap-1'}>
            <span className={'text-4xl font-bold tracking-tight'}>
              {plan.price}
            </span>
          </div>
          <p className={'text-muted-foreground mt-1 text-sm'}>
            {plan.priceNote}
          </p>
        </div>

        <Button
          asChild
          size={'lg'}
          variant={plan.highlight ? 'default' : 'outline'}
          className={'w-full'}
        >
          <Link href={plan.cta.href}>{plan.cta.label}</Link>
        </Button>

        <ul className={'space-y-2.5 text-sm'}>
          {plan.features.map((feature) => (
            <li key={feature} className={'flex items-start gap-2'}>
              <CheckIcon
                className={'text-primary mt-0.5 h-4 w-4 flex-shrink-0'}
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div
          className={
            'text-muted-foreground border-t pt-4 text-xs space-y-1'
          }
        >
          {plan.limits.map((limit) => (
            <p key={limit}>{limit}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default withI18n(PricingPage);
