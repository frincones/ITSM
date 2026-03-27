import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { InboxClient } from './_components/inbox-client';

export const metadata = {
  title: 'Inbox',
};

export default async function InboxPage() {
  const client = getSupabaseServerClient();

  // Fetch current agent
  const {
    data: { user },
  } = await client.auth.getUser();

  let currentAgentId: string | null = null;

  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single();

    currentAgentId = agent?.id ?? null;
  }

  // Fetch inbox conversations with joins (RLS filters by tenant_id)
  const { data: conversations } = await client
    .from('inbox_conversations')
    .select(
      `
      id,
      status,
      subject,
      last_message_at,
      assigned_agent_id,
      ai_summary,
      metadata,
      created_at,
      channel:inbox_channels(id, name, channel_type),
      contact:contacts(id, name, email, phone, avatar_url),
      assigned_agent:agents!inbox_conversations_assigned_agent_id_fkey(id, name, avatar_url)
    `,
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);

  // Fetch last message for each conversation
  const conversationsWithLastMessage = await Promise.all(
    (conversations ?? []).map(async (conv) => {
      const { data: lastMessages } = await client
        .from('inbox_messages')
        .select(
          'id, direction, sender_type, content_text, attachments, ai_classification, created_at',
        )
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        ...conv,
        last_message: lastMessages?.[0] ?? null,
      };
    }),
  );

  return (
    <InboxClient
      conversations={conversationsWithLastMessage}
      currentAgentId={currentAgentId}
    />
  );
}
