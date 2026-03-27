import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export interface RoutingInput {
  ticketId: string;
  type: string;
  category: string;
  urgency: string;
  tenantId: string;
  summary?: string;
  skillsMatrix?: Array<{
    agentId: string;
    agentName: string;
    groupId: string;
    groupName: string;
    skills: string[];
    currentWorkload: number;
    maxWorkload: number;
    availability: boolean;
  }>;
}

export interface RoutingResult {
  assigned_agent_id: string | null;
  assigned_group_id: string;
  reasoning: string;
  alternative_agents: Array<{
    agent_id: string;
    reason: string;
  }>;
  priority_score: number;
}

export async function routeTicket(
  input: RoutingInput,
): Promise<{ data: RoutingResult | null; error: string | null }> {
  try {
    const skillsContext = input.skillsMatrix?.length
      ? `\nAvailable agents and groups:\n${JSON.stringify(input.skillsMatrix, null, 2)}`
      : '\nNo skills matrix provided. Suggest a group based on category and type.';

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an ITSM routing agent for NovaDesk. Your job is to assign tickets to the best agent or group based on skills, workload, and availability.

Rules:
- Match ticket category and type to agent skills.
- Prefer agents with lower workload (currentWorkload / maxWorkload ratio).
- Only assign to available agents.
- If no specific agent fits, assign to the most relevant group (assigned_agent_id = null).
- Critical urgency tickets should go to the most skilled available agent regardless of workload.
- Provide clear reasoning for the assignment.
- priority_score is 1-10 (10 = highest priority for processing).

Respond ONLY with valid JSON matching this schema:
{
  "assigned_agent_id": "<agent_id_or_null>",
  "assigned_group_id": "<group_id>",
  "reasoning": "<explanation>",
  "alternative_agents": [{"agent_id": "<id>", "reason": "<why_alternative>"}],
  "priority_score": <1-10>
}`,
      prompt: `Ticket ID: ${input.ticketId}
Type: ${input.type}
Category: ${input.category}
Urgency: ${input.urgency}
Tenant: ${input.tenantId}
${input.summary ? `Summary: ${input.summary}` : ''}${skillsContext}`,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.text) as RoutingResult;

    return { data: parsed, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown routing agent error';
    return { data: null, error: message };
  }
}
