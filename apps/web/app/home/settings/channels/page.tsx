import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ChannelsClient } from './_components/channels-client';

export const metadata = {
  title: 'Channels',
};

export default async function ChannelsPage() {
  const client = getSupabaseServerClient();

  // Fetch inbox channels for current tenant (RLS filters by tenant_id)
  const { data: channels } = await client
    .from('inbox_channels')
    .select(
      `
      id,
      channel_type,
      name,
      config,
      is_active,
      auto_create_ticket,
      ai_processing,
      created_at,
      updated_at
    `,
    )
    .order('created_at', { ascending: false });

  return <ChannelsClient channels={channels ?? []} />;
}
