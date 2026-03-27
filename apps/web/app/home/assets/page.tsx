import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { AssetsClient } from './_components/assets-client';

export const metadata = {
  title: 'Asset Management',
};

export default async function AssetsPage() {
  const client = getSupabaseServerClient();

  // Fetch assets
  const { data: assets } = await client
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });

  // Fetch asset counts by status
  const { count: totalAssets } = await client
    .from('assets')
    .select('id', { count: 'exact', head: true });

  const { count: inUseCount } = await client
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in_use');

  const { count: availableCount } = await client
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'available');

  const { count: maintenanceCount } = await client
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'maintenance');

  return (
    <AssetsClient
      assets={assets ?? []}
      totalAssets={totalAssets ?? 0}
      inUseCount={inUseCount ?? 0}
      availableCount={availableCount ?? 0}
      maintenanceCount={maintenanceCount ?? 0}
    />
  );
}
