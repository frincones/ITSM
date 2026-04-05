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

/* ── Intent detection helpers ──────────────────────────────────────────── */

function extractTicketNumber(msg: string): string | null {
  const m = msg.match(/(pdz-\d{4}-\d{5}|tkt-\d{4}-\d{5})/i);
  return m ? m[0].toUpperCase() : null;
}

function extractProblemNumber(msg: string): string | null {
  const m = msg.match(/prb-[a-z0-9]+/i);
  return m ? m[0].toUpperCase() : null;
}

function extractAgentName(msg: string, keyword: string): string | null {
  // "asigna ... a Emma" → "Emma"
  const patterns = [
    new RegExp(`${keyword}\\s+(?:a\\s+)?([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)?)`, 'i'),
    /(?:emma|freddy|bibiana|camilo|admin)/i,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 });

    const { data: agent } = await client.from('agents').select('id, tenant_id, name, role').eq('user_id', user.id).single();
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 403 });

    const { messages } = await req.json();
    const svc = getSvc();
    const tenantId = agent.tenant_id;
    const lastMsg = messages[messages.length - 1]?.content ?? '';
    const lm = lastMsg.toLowerCase();

    let dataContext = '';
    let actionResult = '';

    // ══════════════════════════════════════════════════════════════════
    //  ALWAYS: System stats
    // ══════════════════════════════════════════════════════════════════
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [openRes, pendingRes, createdRes, resolvedRes] = await Promise.all([
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null).in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null).eq('status', 'pending'),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()),
      svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('resolved_at', todayStart.toISOString()),
    ]);
    dataContext += `## Sistema: ${openRes.count ?? 0} abiertos, ${pendingRes.count ?? 0} pendientes, ${createdRes.count ?? 0} creados hoy, ${resolvedRes.count ?? 0} resueltos hoy\n`;

    // ══════════════════════════════════════════════════════════════════
    //  WRITE ACTIONS — Execute mutations before LLM call
    // ══════════════════════════════════════════════════════════════════

    const tktNum = extractTicketNumber(lm);

    // ── 17. Crear ticket ──
    if ((lm.includes('crea') || lm.includes('nuevo')) && lm.includes('ticket') && !tktNum) {
      const orgMatch = lm.match(/(?:para|de|en)\s+(\w+)/i);
      let orgId = null;
      if (orgMatch) {
        const { data: org } = await svc.from('organizations').select('id').eq('tenant_id', tenantId).ilike('name', `%${orgMatch[1]}%`).limit(1).maybeSingle();
        orgId = org?.id ?? null;
      }
      const { data: ticket, error } = await svc.from('tickets').insert({
        tenant_id: tenantId, title: lastMsg.slice(0, 255), description: lastMsg,
        type: 'support', urgency: 'medium', status: 'new', channel: 'ai_agent',
        organization_id: orgId, created_by: user.id,
      }).select('ticket_number, title').single();

      actionResult = error ? `ERROR creando ticket: ${error.message}` : `TICKET CREADO: ${ticket?.ticket_number} — "${ticket?.title}"`;
    }

    // ── 18. Cambiar estado ──
    else if (tktNum && (lm.includes('pasa') || lm.includes('cambia') || lm.includes('mueve') || lm.includes('estado'))) {
      const statusMap: Record<string, string> = {
        'testing': 'testing', 'test': 'testing', 'progreso': 'in_progress', 'progress': 'in_progress',
        'pendiente': 'pending', 'pending': 'pending', 'resuelto': 'resolved', 'resolved': 'resolved',
        'cerrado': 'closed', 'closed': 'closed', 'cancelado': 'cancelled', 'nuevo': 'new', 'asignado': 'assigned',
      };
      let newStatus = '';
      for (const [key, val] of Object.entries(statusMap)) {
        if (lm.includes(key)) { newStatus = val; break; }
      }
      if (newStatus) {
        const { data: t } = await svc.from('tickets').select('id, status').eq('ticket_number', tktNum).eq('tenant_id', tenantId).single();
        if (t) {
          await svc.from('tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', t.id);
          actionResult = `ESTADO CAMBIADO: ${tktNum} de "${t.status}" → "${newStatus}"`;
        } else actionResult = `Ticket ${tktNum} no encontrado`;
      }
    }

    // ── 19. Asignar ticket ──
    else if (tktNum && (lm.includes('asigna') || lm.includes('assign'))) {
      const agentName = extractAgentName(lastMsg, 'asigna');
      if (agentName) {
        const { data: targetAgent } = await svc.from('agents').select('id, name').eq('tenant_id', tenantId).ilike('name', `%${agentName}%`).limit(1).maybeSingle();
        if (targetAgent) {
          await svc.from('tickets').update({ assigned_agent_id: targetAgent.id, status: 'assigned', updated_at: new Date().toISOString() }).eq('ticket_number', tktNum).eq('tenant_id', tenantId);
          actionResult = `ASIGNADO: ${tktNum} → ${targetAgent.name}`;
        } else actionResult = `Agente "${agentName}" no encontrado`;
      }
    }

    // ── 20. Agregar followup ──
    else if (tktNum && (lm.includes('nota') || lm.includes('comentario') || lm.includes('followup') || lm.includes('agrega'))) {
      const { data: t } = await svc.from('tickets').select('id').eq('ticket_number', tktNum).eq('tenant_id', tenantId).single();
      if (t) {
        const content = lastMsg.replace(new RegExp(tktNum, 'gi'), '').replace(/agrega|nota|comentario|interna|al|en|el/gi, '').trim();
        await svc.from('ticket_followups').insert({ tenant_id: tenantId, ticket_id: t.id, content: content || lastMsg, is_private: true, author_id: user.id, author_type: 'agent' });
        actionResult = `NOTA AGREGADA a ${tktNum}`;
      }
    }

    // ── 22. Resolver ticket ──
    else if (tktNum && (lm.includes('resuelve') || lm.includes('resolve') || lm.includes('solución') || lm.includes('solucion'))) {
      const { data: t } = await svc.from('tickets').select('id').eq('ticket_number', tktNum).eq('tenant_id', tenantId).single();
      if (t) {
        const solution = lastMsg.replace(new RegExp(tktNum, 'gi'), '').replace(/resuelve|resolve|solucion|solución/gi, '').trim();
        await svc.from('ticket_solutions').insert({ tenant_id: tenantId, ticket_id: t.id, content: solution || 'Resuelto via AI Assistant', status: 'approved', proposed_by: user.id });
        await svc.from('tickets').update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', t.id);
        actionResult = `RESUELTO: ${tktNum}`;
      }
    }

    // ── 23. Actualizar ticket ──
    else if (tktNum && (lm.includes('actualiza') || lm.includes('cambia urgencia') || lm.includes('cambia tipo') || lm.includes('update'))) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (lm.includes('critical')) updates.urgency = 'critical';
      else if (lm.includes('high') || lm.includes('alta')) updates.urgency = 'high';
      else if (lm.includes('medium') || lm.includes('media')) updates.urgency = 'medium';
      else if (lm.includes('low') || lm.includes('baja')) updates.urgency = 'low';
      if (lm.includes('incident')) updates.type = 'incident';
      else if (lm.includes('backlog')) updates.type = 'backlog';

      await svc.from('tickets').update(updates).eq('ticket_number', tktNum).eq('tenant_id', tenantId);
      actionResult = `ACTUALIZADO: ${tktNum} — ${JSON.stringify(updates)}`;
    }

    // ── 24. Eliminar ticket ──
    else if (tktNum && (lm.includes('elimina') || lm.includes('borra') || lm.includes('delete'))) {
      await svc.from('tickets').update({ deleted_at: new Date().toISOString() }).eq('ticket_number', tktNum).eq('tenant_id', tenantId);
      actionResult = `ELIMINADO (soft delete): ${tktNum}`;
    }

    // ── 25. Crear problema ──
    else if ((lm.includes('crea') || lm.includes('nuevo')) && lm.includes('problema')) {
      const num = `PRB-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await svc.from('problems').insert({
        tenant_id: tenantId, problem_number: num, title: lastMsg.slice(0, 255),
        description: lastMsg, status: 'new', urgency: 'medium', created_by: user.id,
      }).select('problem_number, title').single();
      actionResult = error ? `ERROR: ${error.message}` : `PROBLEMA CREADO: ${data?.problem_number}`;
    }

    // ── 27. Vincular ticket a problema ──
    else if (tktNum && extractProblemNumber(lm)) {
      const prbNum = extractProblemNumber(lm)!;
      const { data: t } = await svc.from('tickets').select('id').eq('ticket_number', tktNum).eq('tenant_id', tenantId).single();
      const { data: p } = await svc.from('problems').select('id').eq('problem_number', prbNum).eq('tenant_id', tenantId).single();
      if (t && p) {
        await svc.from('problem_ticket_links').insert({ tenant_id: tenantId, problem_id: p.id, ticket_id: t.id });
        actionResult = `VINCULADO: ${tktNum} → ${prbNum}`;
      } else actionResult = `No encontrado: ticket o problema`;
    }

    // ── 28. Crear change request ──
    else if ((lm.includes('crea') || lm.includes('nuevo')) && (lm.includes('cambio') || lm.includes('change'))) {
      const num = `CHG-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await svc.from('changes').insert({
        tenant_id: tenantId, change_number: num, title: lastMsg.slice(0, 255),
        description: lastMsg, change_type: 'normal', status: 'new', created_by: user.id,
      }).select('change_number, title').single();
      actionResult = error ? `ERROR: ${error.message}` : `CHANGE CREADO: ${data?.change_number}`;
    }

    // ── 30. Crear artículo KB ──
    else if ((lm.includes('crea') || lm.includes('nuevo')) && (lm.includes('articulo') || lm.includes('artículo') || lm.includes('kb'))) {
      const title = lastMsg.replace(/crea|nuevo|articulo|artículo|kb/gi, '').trim().slice(0, 255) || 'Nuevo artículo';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      const { data, error } = await svc.from('kb_articles').insert({
        tenant_id: tenantId, title, slug, content_markdown: lastMsg,
        status: 'draft', author_id: agent.id,
      }).select('title, slug').single();
      actionResult = error ? `ERROR: ${error.message}` : `ARTÍCULO CREADO: "${data?.title}" (draft) — slug: ${data?.slug}`;
    }

    // ── 31. Publicar artículo ──
    else if (lm.includes('publica') && (lm.includes('articulo') || lm.includes('artículo'))) {
      const slugMatch = lm.match(/(?:articulo|artículo)\s+(?:de\s+)?(\S+)/i);
      if (slugMatch) {
        await svc.from('kb_articles').update({ status: 'published', published_at: new Date().toISOString() }).eq('tenant_id', tenantId).ilike('title', `%${slugMatch[1]}%`);
        actionResult = `ARTÍCULO PUBLICADO que contiene "${slugMatch[1]}"`;
      }
    }

    // ── 34. Crear categoría ──
    else if ((lm.includes('crea') || lm.includes('nueva')) && (lm.includes('categoria') || lm.includes('categoría'))) {
      const name = lastMsg.replace(/crea|nueva|categoria|categoría/gi, '').trim().slice(0, 100) || 'Nueva categoría';
      const { data, error } = await svc.from('categories').insert({ tenant_id: tenantId, name }).select('name').single();
      actionResult = error ? `ERROR: ${error.message}` : `CATEGORÍA CREADA: "${data?.name}"`;
    }

    // ── 35. Cambio masivo de estado ──
    else if (lm.includes('cierra todos') || lm.includes('cerrar todos') || (lm.includes('masivo') && lm.includes('estado'))) {
      const fromStatus = lm.includes('resuelto') ? 'resolved' : lm.includes('pendiente') ? 'pending' : null;
      if (fromStatus) {
        const daysMatch = lm.match(/(\d+)\s*días/);
        let q = svc.from('tickets').update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId).eq('status', fromStatus).is('deleted_at', null);
        if (daysMatch) {
          q = q.lt('created_at', new Date(Date.now() - Number(daysMatch[1]) * 86400000).toISOString());
        }
        const { data } = await q.select('id');
        actionResult = `CERRADOS MASIVAMENTE: ${data?.length ?? 0} tickets de status "${fromStatus}"`;
      }
    }

    // ── 36. Reasignación masiva ──
    else if (lm.includes('reasigna todos') || lm.includes('reasignar todos') || lm.includes('transfiere tickets')) {
      const fromMatch = lm.match(/(?:de|desde)\s+(\w+)/i);
      const toMatch = lm.match(/(?:a|para)\s+(\w+)/i);
      if (fromMatch && toMatch) {
        const { data: fromA } = await svc.from('agents').select('id').eq('tenant_id', tenantId).ilike('name', `%${fromMatch[1]}%`).limit(1).maybeSingle();
        const { data: toA } = await svc.from('agents').select('id, name').eq('tenant_id', tenantId).ilike('name', `%${toMatch[1]}%`).limit(1).maybeSingle();
        if (fromA && toA) {
          const { data } = await svc.from('tickets').update({ assigned_agent_id: toA.id, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('assigned_agent_id', fromA.id).is('deleted_at', null)
            .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']).select('id');
          actionResult = `REASIGNADOS: ${data?.length ?? 0} tickets → ${toA.name}`;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    //  READ CONTEXT — Fetch data for LLM
    // ══════════════════════════════════════════════════════════════════

    // ── 6. Detalle de ticket específico ──
    if (tktNum && !actionResult) {
      const { data: t } = await svc.from('tickets')
        .select('ticket_number, title, status, type, urgency, description, requester_email, assigned_agent_id, organization_id, created_at, resolved_at, channel, tags')
        .eq('ticket_number', tktNum).eq('tenant_id', tenantId).single();
      if (t) {
        const { data: followups } = await svc.from('ticket_followups')
          .select('content, author_type, is_private, created_at').eq('ticket_id', (await svc.from('tickets').select('id').eq('ticket_number', tktNum).single()).data?.id ?? '')
          .order('created_at', { ascending: true }).limit(10);

        let agentName = 'Sin asignar';
        if (t.assigned_agent_id) {
          const { data: a } = await svc.from('agents').select('name').eq('id', t.assigned_agent_id).single();
          agentName = a?.name ?? 'Unknown';
        }
        let orgName = 'N/A';
        if (t.organization_id) {
          const { data: o } = await svc.from('organizations').select('name').eq('id', t.organization_id).single();
          orgName = o?.name ?? 'N/A';
        }

        dataContext += `\n## Detalle ${t.ticket_number}\n- Título: ${t.title}\n- Estado: ${t.status} | Tipo: ${t.type} | Urgencia: ${t.urgency}\n- Descripción: ${(t.description ?? '').slice(0, 500)}\n- Requester: ${t.requester_email ?? 'N/A'}\n- Asignado a: ${agentName}\n- Organización: ${orgName}\n- Canal: ${t.channel ?? 'N/A'}\n- Tags: ${(t.tags ?? []).join(', ') || 'ninguno'}\n- Creado: ${t.created_at}\n- Resuelto: ${t.resolved_at ?? 'Pendiente'}\n`;

        if (followups?.length) {
          dataContext += `\n### Historial (${followups.length} notas):\n`;
          followups.forEach((f: any) => { dataContext += `- [${f.author_type}${f.is_private ? '/privada' : ''}] ${f.content.slice(0, 150)}\n`; });
        }
      }
    }

    // ── Ticket search by status/type/urgency ──
    if (!tktNum && (lm.includes('ticket') || lm.includes('pendiente') || lm.includes('abierto') || lm.includes('critico') || lm.includes('testing') || lm.includes('lista'))) {
      let q = svc.from('tickets').select('ticket_number, title, status, type, urgency, requester_email, assigned_agent_id')
        .eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }).limit(15);

      if (lm.includes('pendiente')) q = q.eq('status', 'pending');
      else if (lm.includes('critico') || lm.includes('critical')) q = q.in('urgency', ['critical', 'high']);
      else if (lm.includes('testing')) q = q.eq('status', 'testing');
      else if (lm.includes('nuevo')) q = q.eq('status', 'new');
      else if (lm.includes('progreso')) q = q.eq('status', 'in_progress');
      else q = q.in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']);

      // ── 7. By category ──
      if (lm.includes('categoria') || lm.includes('categoría') || lm.includes('modulo') || lm.includes('módulo') || lm.includes('clientes') || lm.includes('leads') || lm.includes('accesos')) {
        const catNames = ['clientes', 'leads', 'accesos', 'qr', 'notificaciones', 'afiliados', 'reportes', 'general', 'whatsapp'];
        const matchedCat = catNames.find(c => lm.includes(c));
        if (matchedCat) {
          const { data: cat } = await svc.from('categories').select('id').eq('tenant_id', tenantId).ilike('name', `%${matchedCat}%`).limit(1).maybeSingle();
          if (cat) q = q.eq('category_id', cat.id);
        }
      }

      // ── 8. By agent ──
      const agentNames = ['emma', 'freddy', 'bibiana', 'camilo'];
      const matchedAgent = agentNames.find(a => lm.includes(a));
      if (matchedAgent && (lm.includes('asignado') || lm.includes('tiene') || lm.includes('agente'))) {
        const { data: a } = await svc.from('agents').select('id').eq('tenant_id', tenantId).ilike('name', `%${matchedAgent}%`).limit(1).maybeSingle();
        if (a) q = q.eq('assigned_agent_id', a.id);
      }

      // ── 15. By urgency ──
      if (lm.includes('high') || lm.includes('alta')) q = q.eq('urgency', 'high');
      if (lm.includes('low') || lm.includes('baja')) q = q.eq('urgency', 'low');

      const { data: tickets } = await q;
      if (tickets?.length) {
        dataContext += `\n## Tickets (${tickets.length}):\n`;
        tickets.forEach((t: any) => { dataContext += `- ${t.ticket_number} [${t.status}/${t.urgency}] ${t.title.slice(0, 80)}\n`; });
      }
    }

    // ── Agent workload ──
    if (lm.includes('agente') || lm.includes('carga') || lm.includes('equipo') || lm.includes('rendimiento')) {
      const { data: agents } = await svc.from('agents').select('id, name, role').eq('tenant_id', tenantId);
      const { data: allTickets } = await svc.from('tickets').select('assigned_agent_id, status')
        .eq('tenant_id', tenantId).is('deleted_at', null);

      const stats: Record<string, { open: number; resolved: number; total: number }> = {};
      (allTickets ?? []).forEach((t: any) => {
        if (!t.assigned_agent_id) return;
        if (!stats[t.assigned_agent_id]) stats[t.assigned_agent_id] = { open: 0, resolved: 0, total: 0 };
        stats[t.assigned_agent_id]!.total++;
        if (['resolved', 'closed'].includes(t.status)) stats[t.assigned_agent_id]!.resolved++;
        else stats[t.assigned_agent_id]!.open++;
      });

      dataContext += `\n## Rendimiento Agentes:\n`;
      (agents ?? []).forEach((a: any) => {
        const s = stats[a.id] ?? { open: 0, resolved: 0, total: 0 };
        dataContext += `- ${a.name} (${a.role}): ${s.open} abiertos, ${s.resolved} resueltos, ${s.total} total\n`;
      });
    }

    // ── Organizations ──
    if (lm.includes('organizacion') || lm.includes('cliente') || lm.includes('podenza') || lm.includes('acme') || lm.includes('beta') || lm.includes('gamma')) {
      const { data: orgs } = await svc.from('organizations').select('id, name').eq('tenant_id', tenantId).eq('is_active', true);
      dataContext += `\n## Organizaciones:\n`;
      for (const org of orgs ?? []) {
        const { count } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('organization_id', org.id).is('deleted_at', null);
        const { count: openCount } = await svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('organization_id', org.id).is('deleted_at', null).in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']);
        dataContext += `- ${org.name}: ${count ?? 0} total, ${openCount ?? 0} abiertos\n`;
      }
    }

    // ── SLA ──
    if (lm.includes('sla') || lm.includes('compliance')) {
      const [met, breached] = await Promise.all([
        svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('sla_breached', false),
        svc.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('sla_breached', true),
      ]);
      const total = (met.count ?? 0) + (breached.count ?? 0);
      dataContext += `\n## SLA: Met ${met.count ?? 0} | Breached ${breached.count ?? 0} | ${total > 0 ? Math.round(((met.count ?? 0) / total) * 100) : 100}% compliance\n`;
    }

    // ── 11. Buscar KB ──
    if (lm.includes('articulo') || lm.includes('artículo') || lm.includes('kb') || lm.includes('conocimiento') || lm.includes('busca')) {
      if (!actionResult) { // Only if not creating an article
        const searchTerms = lastMsg.split(' ').filter(w => w.length > 3).slice(0, 3);
        if (searchTerms.length) {
          const { data: articles } = await svc.from('kb_articles').select('title, slug, status, view_count')
            .eq('tenant_id', tenantId).or(searchTerms.map(t => `title.ilike.%${t}%`).join(','))
            .limit(5);
          if (articles?.length) {
            dataContext += `\n## Artículos KB:\n`;
            articles.forEach((a: any) => { dataContext += `- "${a.title}" [${a.status}] (${a.view_count} vistas) slug: ${a.slug}\n`; });
          }
        }
      }
    }

    // ── 12. Inbox conversations ──
    if (lm.includes('inbox') || lm.includes('conversacion') || lm.includes('conversación') || lm.includes('portal chat')) {
      const { data: convs } = await svc.from('inbox_conversations').select('id, subject, status, last_message_at, metadata')
        .eq('tenant_id', tenantId).order('last_message_at', { ascending: false }).limit(10);
      if (convs?.length) {
        dataContext += `\n## Conversaciones Inbox (${convs.length}):\n`;
        convs.forEach((c: any) => {
          const meta = c.metadata ?? {};
          dataContext += `- [${c.status}] ${c.subject ?? 'Sin asunto'} — ${meta.portal_user_email ?? 'N/A'} (${c.last_message_at})\n`;
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════
    //  GENERATE AI RESPONSE
    // ══════════════════════════════════════════════════════════════════

    const { generateText } = await import('ai');

    const systemPrompt = `Eres NovaDesk AI Assistant — copiloto ITSM avanzado para ${agent.name} (${agent.role}).
Responde en español. Sé conciso, profesional y orientado a la acción.
Usa bullet points y formato claro. Referencia tickets por su número.
${actionResult ? `\n## ACCIÓN EJECUTADA:\n${actionResult}\nConfirma la acción al usuario y sugiere siguientes pasos.\n` : ''}
Datos del sistema:\n${dataContext}`;

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages,
      temperature: 0.3,
      maxTokens: 1500,
    });

    return Response.json({ text: result.text });
  } catch (err) {
    console.error('[AI Assistant] Error:', err);
    return Response.json({ error: 'Internal error', detail: err instanceof Error ? err.message : 'Unknown' }, { status: 500 });
  }
}
