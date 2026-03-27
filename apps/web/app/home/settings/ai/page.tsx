import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { AiSettingsClient } from './_components/ai-settings-client';

export const metadata = {
  title: 'AI Configuration — NovaDesk',
};

export default async function AiSettingsPage() {
  const client = getSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  // ── Get tenant ────────────────────────────────────────────────────────────
  const { data: agent } = await client
    .from('agents')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    redirect('/home');
  }

  const tenantId = agent.tenant_id;

  // ── Fetch AI agents config ────────────────────────────────────────────────
  const { data: aiAgents } = await client
    .from('ai_agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('agent_type');

  // ── Fetch knowledge documents count ──────────────────────────────────────
  const { count: knowledgeDocCount } = await client
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // ── Fetch knowledge documents list ───────────────────────────────────────
  const { data: knowledgeDocs } = await client
    .from('knowledge_documents')
    .select('id, title, source_type, source_url, created_at, last_synced_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <AiSettingsClient
      tenantId={tenantId}
      aiAgents={aiAgents ?? []}
      knowledgeDocCount={knowledgeDocCount ?? 0}
      knowledgeDocs={knowledgeDocs ?? []}
    />
  );
}
