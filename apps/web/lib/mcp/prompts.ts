// ---------------------------------------------------------------------------
// MCP Prompts
// ---------------------------------------------------------------------------
// Prompts are user-invoked workflows — typically slash commands in the host
// app. They are not instructions the model follows on its own; a person
// chooses one.
//
// The ones here encode the judgement that this codebase has accumulated
// about its own data, so an agent does not have to rediscover it:
//
//   - SLA compliance cannot be read from `sla_breached`. Only 83 of 714
//     tickets carry a target and none is marked breached, because no
//     organization has an sla_id. A prompt that asks for a compliance
//     report has to say so, or it produces a confident 100%.
//   - NPS has 1 response out of 188 surveys. Same problem.
//   - A ticket's private notes are internal reasoning, not what the client
//     was told.
//
// Each prompt returns messages that name the tools to call and the traps to
// avoid. They do not call anything themselves — the model does, with the
// scopes its key actually holds.
// ---------------------------------------------------------------------------

import 'server-only';

import { invalidParams } from './errors';

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptDescriptor {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgument[];
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface PromptResult {
  description: string;
  messages: PromptMessage[];
}

type Builder = (args: Record<string, string>) => PromptResult;

interface PromptDefinition extends PromptDescriptor {
  build: Builder;
}

const user = (text: string): PromptMessage => ({
  role: 'user',
  content: { type: 'text', text },
});

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

const PROMPTS: PromptDefinition[] = [
  {
    name: 'triage_ticket',
    title: 'Triage a ticket',
    description:
      'Read a ticket, classify it, check whether it is a repeat of something already known, and propose next steps.',
    arguments: [
      { name: 'ticket', description: 'Ticket number (TKT-2610-00001) or uuid.', required: true },
    ],
    build: (a) => ({
      description: `Triage ${a.ticket}`,
      messages: [
        user(
          [
            `Triage ticket ${a.ticket}.`,
            '',
            'Work through this in order:',
            '',
            `1. Read it with tickets_get (include followups) or the resource novadesk://ticket/${a.ticket}.`,
            '2. Search for prior art before proposing anything new:',
            '   - kb_search for an existing article that answers it',
            '   - tickets_search for the same symptom reported before',
            '   - problems_list in case it is a known issue under investigation',
            '3. Assess the classification already on the ticket: type, urgency, impact. Say whether you agree and why, rather than restating it.',
            '4. Recommend next steps, naming the tool for each.',
            '',
            'Two things to be careful about:',
            '',
            '- Private followups are internal notes, not what the client was told. Do not quote one back to a client and do not treat one as evidence they were informed.',
            '- If you find the same symptom in earlier tickets, say so explicitly and link them with tickets_relate rather than treating this as new.',
          ].join('\n'),
        ),
      ],
    }),
  },

  {
    name: 'root_cause_analysis',
    title: 'Root cause analysis',
    description:
      'Build an RCA from the tickets that share a symptom, and record it as a problem.',
    arguments: [
      { name: 'symptom', description: 'What is failing, in the words users use.', required: true },
      { name: 'organization', description: 'Client name, to narrow the search.', required: false },
    ],
    build: (a) => ({
      description: `RCA: ${a.symptom}`,
      messages: [
        user(
          [
            `Build a root cause analysis for: ${a.symptom}`,
            a.organization ? `Limited to the client: ${a.organization}.` : '',
            '',
            '1. Gather the evidence with tickets_search. Read the ones that match — the thread usually holds more than the title.',
            '2. Establish the timeline: when it was first reported, whether it recurs, whether anything was marked resolved and came back.',
            '3. Separate what is observed from what is inferred. State which is which.',
            '4. Create the problem with problems_create, then link every contributing ticket with problems_link_ticket.',
            '5. Record root_cause and workaround with problems_update once you have them.',
            '',
            'Note on evidence: a ticket marked resolved is not proof the fix worked. This system auto-resolves tickets left in testing after 15 days with no client response, so "resolved" can mean "nobody objected". Check the thread for an actual confirmation before counting it as fixed.',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ],
    }),
  },

  {
    name: 'client_health_review',
    title: 'Client health review',
    description:
      'An honest account of how service is going for one client: load, ageing, contract consumption and satisfaction.',
    arguments: [
      { name: 'organization', description: 'Client name or uuid.', required: true },
    ],
    build: (a) => ({
      description: `Health review: ${a.organization}`,
      messages: [
        user(
          [
            `Review the service health of ${a.organization}.`,
            '',
            'Gather:',
            '',
            '1. organizations_list / organizations_get to resolve the client.',
            '2. reports_ticket_stats for the shape of the load.',
            '3. tickets_list filtered to open states, sorted oldest first — ageing matters more than volume.',
            '4. contract_cycle_usage and contract_cycle_compliance for quota and contractual performance.',
            '5. nps_summary for satisfaction.',
            '6. portal_activity to see whether they are actually using the portal.',
            '',
            'Report honestly, which here means:',
            '',
            '- Run sla_coverage FIRST. Across this system only a small fraction of tickets carry an SLA target, and none is marked breached — because no SLA policy is attached, not because targets were met. Quoting a compliance figure without that context produces a confident wrong answer.',
            '- nps_summary returns a response rate. If almost nobody answered, say the sample is too small instead of reporting the score as a result.',
            '- Name the oldest untouched tickets specifically. "Several old tickets" is not actionable; "TKT-X, 132 days, no movement since creation" is.',
            '- If the picture is bad, say it plainly. A health review that reassures is worthless.',
          ].join('\n'),
        ),
      ],
    }),
  },

  {
    name: 'document_solution',
    title: 'Document a solution',
    description:
      'Turn a resolved ticket into a knowledge base article so the next person does not start from zero.',
    arguments: [
      { name: 'ticket', description: 'The resolved ticket to document.', required: true },
    ],
    build: (a) => ({
      description: `Document the solution to ${a.ticket}`,
      messages: [
        user(
          [
            `Write a knowledge base article from ticket ${a.ticket}.`,
            '',
            '1. Read the ticket and its thread, including any recorded solution.',
            '2. Check with kb_search whether an article already covers this. If one does, update it with kb_update_article instead of adding a near-duplicate.',
            '3. Write for whoever hits this next, not as a summary of the ticket: the symptom as a user would describe it, how to confirm it is this and not something similar, the fix step by step, and how to verify it worked.',
            '4. Create it with kb_create_article. It starts as a draft.',
            '',
            'Before setting is_public: true, consider that a public article is visible to every client in their portal. Anything naming another client, an internal system or a workaround we would not stand behind publicly stays internal.',
            '',
            'Leave it as a draft. Publishing is a separate decision for a person to make with kb_publish_article.',
          ].join('\n'),
        ),
      ],
    }),
  },

  {
    name: 'cycle_report',
    title: 'Monthly cycle report',
    description:
      'The contractual report for a billing cycle: consumption, compliance, credits and termination risk.',
    arguments: [
      { name: 'organization', description: 'Client name or uuid.', required: true },
      { name: 'date', description: 'A date inside the cycle (YYYY-MM-DD). Defaults to today.', required: false },
    ],
    build: (a) => ({
      description: `Cycle report: ${a.organization}`,
      messages: [
        user(
          [
            `Produce the support cycle report for ${a.organization}${a.date ? `, for the cycle covering ${a.date}` : ''}.`,
            '',
            '1. organizations_contracts for the terms in force — note that contracts are time-bounded, so an older cycle may fall under different terms.',
            '2. contract_cycle_usage for quota consumption.',
            '3. contract_cycle_compliance for contractual performance and any credits owed.',
            '4. contract_daily_activity to show how the load was distributed.',
            '5. contract_termination_risk if compliance looks weak.',
            '',
            'This report can end up in front of the client, so:',
            '',
            '- Take the compliance figures from contract_cycle_compliance, which computes from the contract. Do NOT derive them from sla_breached on tickets — that column is unpopulated here and reads as perfect compliance.',
            '- If credits are owed, state the amount and why. A report that omits an owed credit is worse than no report.',
            '- Cycles run from the contract cycle_start_day, not calendar months. Give the actual window.',
          ].join('\n'),
        ),
      ],
    }),
  },

  {
    name: 'automation_audit',
    title: 'Audit automation',
    description:
      'Review the workflows and rules that are running, and find the ones that fire but do nothing.',
    arguments: [],
    build: () => ({
      description: 'Audit workflows and rules',
      messages: [
        user(
          [
            'Audit the automation configured in this system.',
            '',
            '1. workflows_list and rules_list — note which are active.',
            '2. workflows_get and rules_get for each active one, to see the steps, conditions and actions.',
            '3. workflows_executions and rules_execution_logs for what has actually run.',
            '',
            'Look for:',
            '',
            '- Active automation that has never fired. Either the trigger is wrong or it is dead weight.',
            '- Rules that evaluate frequently and rarely match. rules_execution_logs with matched: false shows these.',
            '- Rules whose conditions overlap, where stop_on_match means a lower-priority one never runs.',
            '- Workflows with no steps, or rules with no actions.',
            '',
            'Report what you would change and why. Do not change anything: enabling or disabling automation affects live tickets from the next event onward, and that is a decision for a person.',
          ].join('\n'),
        ),
      ],
    }),
  },
];

// ---------------------------------------------------------------------------
// Registry surface
// ---------------------------------------------------------------------------

export function listPrompts(): PromptDescriptor[] {
  return PROMPTS.map(({ name, title, description, arguments: args }) => ({
    name,
    title,
    description,
    arguments: args,
  }));
}

export function getPrompt(name: string, args: Record<string, unknown> = {}): PromptResult {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) {
    throw invalidParams(
      `Unknown prompt '${name}'. Available: ${PROMPTS.map((p) => p.name).join(', ')}`,
    );
  }

  const missing = prompt.arguments
    .filter((arg) => arg.required)
    .filter((arg) => {
      const v = args[arg.name];
      return v === undefined || v === null || String(v).trim() === '';
    })
    .map((arg) => arg.name);

  if (missing.length) {
    throw invalidParams(
      `Prompt '${name}' requires: ${missing.join(', ')}`,
    );
  }

  // Normalise to strings: the spec allows any JSON value as an argument, and
  // these get interpolated into text.
  const normalised: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined && v !== null) normalised[k] = String(v);
  }

  return prompt.build(normalised);
}
