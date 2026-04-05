import { NextRequest } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

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
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 });
    }

    const { data: agent } = await client
      .from('agents')
      .select('id, tenant_id, name, role')
      .eq('user_id', user.id)
      .single();

    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 403 });

    const { messages } = await req.json();
    const svc = getSvc();
    const tenantId = agent.tenant_id;
    const lastMsg = messages[messages.length - 1]?.content ?? '';

    // ── Pre-fetch context based on intent ─────────────────────────────
    let dataContext = '';
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [openRes, pendingRes, createdRes, resolvedRes] = await Promise.all([
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null).in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null).eq('status', 'pending'),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('resolved_at', todayStart.toISOString()),
    ]);

    dataContext += `## Estado Actual\n- Abiertos: ${openRes.count ?? 0}\n- Pendientes: ${pendingRes.count ?? 0}\n- Creados hoy: ${createdRes.count ?? 0}\n- Resueltos hoy: ${resolvedRes.count ?? 0}\n`;

    const lowerMsg = lastMsg.toLowerCase();

    // Ticket search
    if (lowerMsg.includes('pendiente') || lowerMsg.includes('abierto') || lowerMsg.includes('critico') || lowerMsg.includes('testing') || lowerMsg.includes('ticket')) {
      let q = svc.from('tickets')
        .select('ticket_number, title, status, type, urgency, requester_email')
        .eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(15);

      if (lowerMsg.includes('pendiente')) q = q.eq('status', 'pending');
      else if (lowerMsg.includes('critico')) q = q.in('urgency', ['critical', 'high']);
      else if (lowerMsg.includes('testing')) q = q.eq('status', 'testing');
      else q = q.in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']);

      const { data: tickets } = await q;
      if (tickets?.length) {
        dataContext += `\n## Tickets (${tickets.length}):\n`;
        tickets.forEach((t: any) => { dataContext += `- ${t.ticket_number} [${t.status}/${t.urgency}] ${t.title}\n`; });
      }
    }

    // Agent workload
    if (lowerMsg.includes('agente') || lowerMsg.includes('carga') || lowerMsg.includes('asignado') || lowerMsg.includes('equipo')) {
      const { data: agents } = await svc.from('agents').select('id, name, role').eq('tenant_id', tenantId);
      const { data: tickets } = await svc.from('tickets')
        .select('assigned_agent_id').eq('tenant_id', tenantId).is('deleted_at', null)
        .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']);

      const workload: Record<string, number> = {};
      (tickets ?? []).forEach((t: any) => { if (t.assigned_agent_id) workload[t.assigned_agent_id] = (workload[t.assigned_agent_id] ?? 0) + 1; });

      dataContext += `\n## Carga por Agente:\n`;
      (agents ?? []).forEach((a: any) => { dataContext += `- ${a.name} (${a.role}): ${workload[a.id] ?? 0} tickets\n`; });
    }

    // Organizations
    if (lowerMsg.includes('organizacion') || lowerMsg.includes('cliente') || lowerMsg.includes('podenza') || lowerMsg.includes('acme')) {
      const { data: orgs } = await svc.from('organizations').select('id, name').eq('tenant_id', tenantId).eq('is_active', true);
      dataContext += `\n## Organizaciones:\n`;
      for (const org of orgs ?? []) {
        const { count } = await svc.from('tickets').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('organization_id', org.id).is('deleted_at', null);
        dataContext += `- ${org.name}: ${count ?? 0} tickets\n`;
      }
    }

    // SLA
    if (lowerMsg.includes('sla') || lowerMsg.includes('compliance') || lowerMsg.includes('rendimiento')) {
      const [met, breached] = await Promise.all([
        svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('sla_breached', false),
        svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('sla_breached', true),
      ]);
      const total = (met.count ?? 0) + (breached.count ?? 0);
      dataContext += `\n## SLA: Met ${met.count ?? 0} | Breached ${breached.count ?? 0} | ${total > 0 ? Math.round(((met.count ?? 0) / total) * 100) : 'N/A'}% compliance\n`;
    }

    // ── Generate response ─────────────────────────────────────────────
    const { generateText } = await import('ai');

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `Eres NovaDesk AI Assistant — copiloto ITSM avanzado para ${agent.name} (${agent.role}).
Responde en español. Sé conciso, profesional y orientado a la acción.
Usa bullet points y formato claro. Referencia tickets por su número.

Datos del sistema:\n${dataContext}`,
      messages,
      temperature: 0.3,
      maxTokens: 1500,
    });

    return Response.json({ text: result.text });
  } catch (err) {
    console.error('[AI Assistant] Error:', err);
    return Response.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
