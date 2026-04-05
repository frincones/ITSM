import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardInsight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence: number | null;
  severity: string | null;
  metadata: Record<string, unknown>;
  organization_id: string | null;
  generated_at: string;
}

export interface AIPerformanceData {
  autoClassificationRate: number;
  aiResolvedNoHuman: number;
  aiAssistedResolution: number;
  totalTickets: number;
  aiClassifiedTickets: number;
  aiResolvedTickets: number;
  aiAssistedTickets: number;
}

// ---------------------------------------------------------------------------
// 1. calculateAIPerformance — Real metrics from ticket data
// ---------------------------------------------------------------------------

export async function calculateAIPerformance(
  client: SupabaseClient,
  tenantId: string,
): Promise<AIPerformanceData> {
  // Count total tickets (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { count: totalTickets } = await client
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .gte('created_at', thirtyDaysAgo);

  // Tickets that were AI-classified (have ai_classification not null)
  const { count: aiClassifiedTickets } = await client
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .gte('created_at', thirtyDaysAgo)
    .not('ai_classification', 'is', null);

  // Tickets created from portal (AI-assisted at minimum)
  const { count: portalTickets } = await client
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .gte('created_at', thirtyDaysAgo)
    .eq('channel', 'portal');

  // Tickets resolved that came from portal (AI-resolved proxy)
  const { count: portalResolved } = await client
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .gte('created_at', thirtyDaysAgo)
    .eq('channel', 'portal')
    .in('status', ['resolved', 'closed']);

  const total = totalTickets ?? 0;
  const classified = aiClassifiedTickets ?? 0;
  const portal = portalTickets ?? 0;
  const resolved = portalResolved ?? 0;

  // Auto-classification rate: tickets with AI classification / total
  const autoClassificationRate = total > 0 ? Math.round((classified / total) * 100) : 0;

  // AI-resolved (no human): portal tickets that got resolved quickly (proxy)
  // A better heuristic: tickets from portal resolved without agent reassignment
  const aiResolvedNoHuman = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // AI-assisted: all portal tickets / total (AI was involved in the flow)
  const aiAssistedResolution = total > 0 ? Math.round((portal / total) * 100) : 0;

  return {
    autoClassificationRate,
    aiResolvedNoHuman,
    aiAssistedResolution,
    totalTickets: total,
    aiClassifiedTickets: classified,
    aiResolvedTickets: resolved,
    aiAssistedTickets: portal,
  };
}

// ---------------------------------------------------------------------------
// 2. generateAIInsights — LLM-powered analysis of ticket patterns
// ---------------------------------------------------------------------------

export async function generateAIInsights(
  client: SupabaseClient,
  tenantId: string,
): Promise<DashboardInsight[]> {
  // Gather data for the LLM
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    ticketsByStatus,
    ticketsByType,
    ticketsByOrg,
    ticketsByCategory,
    recentTickets,
  ] = await Promise.all([
    client.from('tickets').select('status').eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', sevenDaysAgo),
    client.from('tickets').select('type').eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', sevenDaysAgo),
    client.from('tickets').select('organization_id').eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', sevenDaysAgo),
    client.from('tickets').select('category_id, category:categories!tickets_category_id_fkey(name)').eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', sevenDaysAgo),
    client.from('tickets').select('title, type, urgency, status, organization_id, created_at').eq('tenant_id', tenantId).is('deleted_at', null).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(50),
  ]);

  // Aggregate
  const statusCounts: Record<string, number> = {};
  (ticketsByStatus.data ?? []).forEach((t: any) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });

  const typeCounts: Record<string, number> = {};
  (ticketsByType.data ?? []).forEach((t: any) => { typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1; });

  const orgCounts: Record<string, number> = {};
  (ticketsByOrg.data ?? []).forEach((t: any) => { if (t.organization_id) orgCounts[t.organization_id] = (orgCounts[t.organization_id] ?? 0) + 1; });

  const catCounts: Record<string, number> = {};
  (ticketsByCategory.data ?? []).forEach((t: any) => {
    const name = (t.category as any)?.name ?? 'Sin categoría';
    catCounts[name] = (catCounts[name] ?? 0) + 1;
  });

  // Get org names
  const orgIds = Object.keys(orgCounts);
  let orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await client.from('organizations').select('id, name').in('id', orgIds);
    (orgs ?? []).forEach((o: any) => { orgNames[o.id] = o.name; });
  }

  const totalRecent = (recentTickets.data ?? []).length;

  // Build context for LLM
  const dataContext = `
Datos de los últimos 7 días:
- Total tickets: ${totalRecent}
- Por estado: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Por tipo: ${Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Por categoría: ${Object.entries(catCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Por organización: ${Object.entries(orgCounts).map(([id, v]) => `${orgNames[id] ?? id}: ${v}`).join(', ')}

Títulos de tickets recientes:
${(recentTickets.data ?? []).slice(0, 20).map((t: any) => `- [${t.type}/${t.urgency}] ${t.title}`).join('\n')}
`;

  try {
    const { generateText } = await import('ai');
    const { openai } = await import('@ai-sdk/openai');

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: `You are an ITSM analytics AI for NovaDesk. Analyze ticket data deeply and generate actionable insights.
Return ONLY a JSON array of 4-6 insights. Each insight must have:
{
  "insight_type": "pattern" | "recommendation" | "alert" | "trend" | "anomaly" | "prediction",
  "title": "Short title in Spanish (max 60 chars)",
  "description": "Detailed description in Spanish (max 250 chars). Be SPECIFIC: mention organization names, categories, exact counts, percentages.",
  "confidence": 0.0 to 1.0,
  "severity": "info" | "warning" | "critical",
  "org_name": "organization name if applicable or null"
}

Generate insights covering ALL of these areas:
1. PATTERN: Identify recurring issues by category or module (e.g., "Clientes module has 54% of all tickets")
2. TREND: Compare volume trends, identify spikes or drops
3. ALERT: Flag organizations or categories with unusually high ticket counts
4. RECOMMENDATION: Suggest KB articles to create, processes to improve, or automations to set up
5. ANOMALY: Detect unusual patterns (e.g., sudden increase in a specific type)
6. PREDICTION: Based on current trends, predict what might happen next week

Be SPECIFIC with real data — never generic. Always mention organization names, exact numbers, and percentages.
Each insight MUST reference specific data points from the analysis.`,
      prompt: dataContext,
      temperature: 0.3,
      maxTokens: 1024,
    });

    const cleaned = result.text.replace(/```json\s*|\s*```/g, '').trim();
    const insights = JSON.parse(cleaned) as Array<{
      insight_type: string;
      title: string;
      description: string;
      confidence: number;
      severity: string;
      org_name?: string | null;
    }>;

    // Resolve org_name to org_id
    const allOrgs = await client.from('organizations').select('id, name').eq('tenant_id', tenantId);
    const orgNameToId = new Map((allOrgs.data ?? []).map((o: any) => [o.name?.toLowerCase(), o.id]));

    // Persist insights
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

    // Delete old insights
    await client.from('ai_dashboard_insights').delete().eq('tenant_id', tenantId);

    const rows = insights.map((i) => ({
      tenant_id: tenantId,
      organization_id: i.org_name ? (orgNameToId.get(i.org_name.toLowerCase()) ?? null) : null,
      insight_type: i.insight_type,
      title: i.title,
      description: i.description,
      confidence: i.confidence,
      severity: i.severity,
      metadata: { org_name: i.org_name },
      generated_at: now,
      expires_at: expiresAt,
    }));

    if (rows.length > 0) {
      await client.from('ai_dashboard_insights').insert(rows);
    }

    return rows.map((r, idx) => ({
      id: `gen-${idx}`,
      ...r,
    })) as DashboardInsight[];
  } catch (err) {
    console.error('[AI Insights] Generation failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. getLatestInsights — Fetch persisted insights
// ---------------------------------------------------------------------------

export async function getLatestInsights(
  client: SupabaseClient,
  tenantId: string,
): Promise<DashboardInsight[]> {
  const { data } = await client
    .from('ai_dashboard_insights')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('generated_at', { ascending: false })
    .limit(4);

  return (data ?? []) as DashboardInsight[];
}

// ---------------------------------------------------------------------------
// 4. persistAIPerformance — Save daily AI performance snapshot
// ---------------------------------------------------------------------------

export async function persistAIPerformance(
  client: SupabaseClient,
  tenantId: string,
  perf: AIPerformanceData,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await client.from('ai_performance_metrics').upsert({
    tenant_id: tenantId,
    date: today,
    auto_classification_rate: perf.autoClassificationRate,
    ai_resolved_no_human: perf.aiResolvedNoHuman,
    ai_assisted_resolution: perf.aiAssistedResolution,
    total_tickets: perf.totalTickets,
    ai_classified_tickets: perf.aiClassifiedTickets,
    ai_resolved_tickets: perf.aiResolvedTickets,
    ai_assisted_tickets: perf.aiAssistedTickets,
  }, { onConflict: 'tenant_id,date' });
}
