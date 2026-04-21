import Link from 'next/link';

import {
  ArrowRightIcon,
  BotIcon,
  GaugeIcon,
  InboxIcon,
  LayersIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react';

import {
  CtaButton,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
} from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import { withI18n } from '~/lib/i18n/with-i18n';

function Home() {
  return (
    <div className={'mt-4 flex flex-col space-y-24 py-14'}>
      <div className={'container mx-auto'}>
        <Hero
          pill={
            <Pill label={'New'}>
              <span>AI-first IT Service Management for modern teams</span>
            </Pill>
          }
          title={
            <>
              <span>Resolve tickets 3× faster</span>
              <span>with agentic AI that works for you</span>
            </>
          }
          subtitle={
            <span>
              NovaDesk ITSM combines ticketing, knowledge, workflows, and a
              multi-agent AI to help IT teams ship support that feels like
              product. Cut first-response time, automate the boring 80%, and
              delight every requester.
            </span>
          }
          cta={<MainCallToActionButton />}
        />
      </div>

      <div className={'container mx-auto'}>
        <div
          className={'flex flex-col space-y-16 xl:space-y-32 2xl:space-y-36'}
        >
          <FeatureShowcase
            heading={
              <>
                <b className="font-semibold dark:text-white">
                  Everything your IT team needs.
                </b>{' '}
                <span className="text-muted-foreground font-normal">
                  One platform that replaces the tangle of help-desk tools,
                  automations, and AI copilots you&apos;re paying for today.
                </span>
              </>
            }
            icon={
              <FeatureShowcaseIconContainer>
                <LayersIcon className="h-5" />
                <span>All-in-one ITSM platform</span>
              </FeatureShowcaseIconContainer>
            }
          >
            <FeatureGrid>
              <FeatureCard
                className={'relative col-span-2 overflow-hidden'}
                label={'Multi-agent AI'}
                description={
                  'Eight specialized agents — triage, support, resolution, routing, escalation, analytics, quality, inbox — collaborate to resolve up to 80% of tickets automatically.'
                }
              />

              <FeatureCard
                className={
                  'relative col-span-2 w-full overflow-hidden lg:col-span-1'
                }
                label={'Omnichannel inbox'}
                description={
                  'Email, WhatsApp, portal, API, and web widget converge into a single inbox with smart routing and templates.'
                }
              />

              <FeatureCard
                className={'relative col-span-2 overflow-hidden lg:col-span-1'}
                label={'Visual workflow builder'}
                description={
                  'Design approval flows, escalations, and integrations with AI decisions and human-approval steps.'
                }
              />

              <FeatureCard
                className={'relative col-span-2 overflow-hidden'}
                label={'Multi-client, multi-tenant'}
                description={
                  'Purpose-built for MSPs: isolated data per organization, white-label portal, per-client access controls.'
                }
              />
            </FeatureGrid>
          </FeatureShowcase>
        </div>
      </div>

      <div className={'container mx-auto'}>
        <div className={'mx-auto max-w-3xl text-center'}>
          <h2 className={'text-3xl font-bold tracking-tight md:text-4xl'}>
            Built for every ITSM process
          </h2>
          <p className={'text-muted-foreground mt-3 text-lg'}>
            From incident response to change management — one platform, one
            source of truth.
          </p>
        </div>

        <div className={'mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3'}>
          <HighlightCard
            icon={<BotIcon className={'h-6 w-6'} />}
            title={'AI Copilot on every ticket'}
            description={
              'Suggestions, summaries, auto-classification, and reply drafts powered by Claude Sonnet and RAG over your knowledge base.'
            }
          />
          <HighlightCard
            icon={<InboxIcon className={'h-6 w-6'} />}
            title={'Tickets, problems, changes'}
            description={
              'Full ITIL-aligned incident, problem, and change management with SLAs, calendars, and CAB approvals.'
            }
          />
          <HighlightCard
            icon={<WorkflowIcon className={'h-6 w-6'} />}
            title={'Automations that think'}
            description={
              'Rules and workflows that trigger on events, call APIs, branch on AI decisions, and pause for human approval.'
            }
          />
          <HighlightCard
            icon={<SparklesIcon className={'h-6 w-6'} />}
            title={'Knowledge that learns'}
            description={
              'A knowledge base with feedback loops, versioning, and AI-authored drafts from resolved tickets.'
            }
          />
          <HighlightCard
            icon={<GaugeIcon className={'h-6 w-6'} />}
            title={'Reports that matter'}
            description={
              'Pre-built dashboards for SLA compliance, first-response, resolution time, CSAT, and agent performance.'
            }
          />
          <HighlightCard
            icon={<ShieldCheckIcon className={'h-6 w-6'} />}
            title={'Enterprise-grade security'}
            description={
              'Row-Level-Security multi-tenancy, MFA, audit logs, IP allowlist, and data residency options.'
            }
          />
        </div>
      </div>

      <div className={'container mx-auto'}>
        <div
          className={
            'from-primary/5 to-primary/10 border-primary/20 rounded-3xl border bg-gradient-to-br p-10 text-center md:p-16'
          }
        >
          <h2 className={'text-3xl font-bold tracking-tight md:text-4xl'}>
            Ready to retire your help desk?
          </h2>
          <p
            className={
              'text-muted-foreground mx-auto mt-4 max-w-2xl text-lg'
            }
          >
            Start free with up to 3 agents. No credit card required. Upgrade
            the day you outgrow it.
          </p>
          <div
            className={'mt-8 flex flex-wrap justify-center gap-3'}
          >
            <CtaButton>
              <Link href={'/auth/sign-up'}>
                <span className={'flex items-center gap-2'}>
                  <span>Start free</span>
                  <ArrowRightIcon className={'h-4 w-4'} />
                </span>
              </Link>
            </CtaButton>
            <CtaButton variant={'outline'}>
              <Link href={'/pricing'}>
                <span>See pricing</span>
              </Link>
            </CtaButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function HighlightCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className={
        'bg-card rounded-2xl border p-6 transition hover:shadow-md'
      }
    >
      <div
        className={
          'bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-lg'
        }
      >
        {icon}
      </div>
      <h3 className={'mt-4 text-base font-semibold'}>{title}</h3>
      <p className={'text-muted-foreground mt-2 text-sm leading-relaxed'}>
        {description}
      </p>
    </div>
  );
}

function MainCallToActionButton() {
  return (
    <div className={'flex space-x-4'}>
      <CtaButton>
        <Link href={'/auth/sign-up'}>
          <span className={'flex items-center space-x-0.5'}>
            <span>
              <Trans i18nKey={'common:getStarted'} />
            </span>

            <ArrowRightIcon
              className={
                'animate-in fade-in slide-in-from-left-8 h-4' +
                ' zoom-in fill-mode-both delay-1000 duration-1000'
              }
            />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'}>
        <Link href={'/pricing'}>See pricing</Link>
      </CtaButton>
    </div>
  );
}

export default withI18n(Home);
