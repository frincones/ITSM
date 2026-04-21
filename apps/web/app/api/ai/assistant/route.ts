import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { buildAssistantTools } from '~/lib/ai/assistant-tools';

// AI calls + tool round-trips can take a while. 45s is well under Vercel's
// limit for Hobby (60s) and gives the LLM enough room to chain several
// tool calls if the question is complex ("lista los abiertos críticos de
// Prosuministros y cuántos tiene Daniel").
export const maxDuration = 45;

const LLM_TIMEOUT_MS = 40_000;
const MAX_STEPS = 8;

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (!user) {
      return Response.json(
        { error: 'Unauthorized', detail: authError?.message },
        { status: 401 },
      );
    }

    const { data: agentRow } = await client
      .from('agents')
      .select('id, tenant_id, name, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!agentRow) {
      return Response.json({ error: 'Agent not found' }, { status: 403 });
    }
    const agent = agentRow as unknown as {
      id: string;
      tenant_id: string;
      name: string | null;
      role: string;
    };

    const { messages } = (await req.json()) as {
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    };

    const svc = getSvc();
    const agentName = agent.name ?? 'Agente';
    const agentRole = agent.role;

    const tools = buildAssistantTools({
      svc,
      tenantId: agent.tenant_id,
      userId: user.id,
      agentId: agent.id,
      agentName,
    });

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `Eres NovaDesk AI Assistant, copiloto ITSM para ${agentName} (rol: ${agentRole}).
Hoy es ${today}. Responde SIEMPRE en español, conciso y profesional.

Tienes acceso a herramientas que consultan la base de datos real del sistema. Úsalas cuando necesites datos concretos — nunca inventes números, nombres o ticket numbers.

Reglas de uso:
1. Si el usuario pide números o conteos ("cuántos X", "breakdown por Y") → usa count_tickets. Devuelve totales exactos.
2. Si busca por texto en tickets ("casos sobre cotización", "que mencionen error") → usa search_tickets.
3. Si pide una lista filtrada ("pendientes", "de Podenza", "sin asignar") → usa list_tickets.
4. Si pide detalle de un ticket específico (menciona el número PDZ-XXXX-YYYYY o TKT-XXXX-YYYYY) → usa get_ticket.
5. Si pregunta por personas/clientes concretos ("datos de Daniel", "clientes con más tickets") → usa list_requesters.
6. Si pregunta por agentes o rendimiento → usa list_agents_workload.
7. Si pide crear/modificar/resolver/reasignar → usa los tools de escritura. Confirma la acción al final.

Después de ejecutar una o más herramientas, responde con bullet points claros. Referencia tickets por su ticket_number (nunca el UUID). Si una consulta no arrojó resultados, dilo explícitamente en vez de inventar.

Puedes encadenar varias herramientas si hace falta (hasta ${MAX_STEPS} pasos). No menciones los nombres de las herramientas al usuario — solo los resultados.`;

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      system: systemPrompt,
      messages,
      temperature: 0.2,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    return Response.json({
      text: result.text,
      steps: result.steps?.length ?? 0,
    });
  } catch (err) {
    console.error('[AI Assistant] Error:', err);
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError');
    return Response.json(
      {
        error: 'Internal error',
        detail: isTimeout
          ? 'El análisis tardó demasiado. Intenta con una pregunta más específica.'
          : err instanceof Error
            ? err.message
            : 'Unknown',
      },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
