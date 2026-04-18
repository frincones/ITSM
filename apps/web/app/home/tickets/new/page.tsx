import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CreateTicketForm } from './_components/create-ticket-form';

export const metadata = {
  title: 'Create Ticket',
};

export default async function NewTicketPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  // If the user is an org_user (client), lock them to their organization.
  // Agents keep the full picker.
  let lockedOrg: { id: string; name: string } | null = null;
  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!agent) {
      const { data: orgUser } = await client
        .from('organization_users')
        .select('organization:organizations(id, name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      const org = (orgUser?.organization ?? null) as
        | { id: string; name: string }
        | null;
      if (org) lockedOrg = org;
    }
  }

  // Fetch categories for the dropdown
  const { data: categories } = await client
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  // Fetch organizations for the dropdown (only needed when not locked)
  const { data: organizations } = lockedOrg
    ? { data: [{ id: lockedOrg.id, name: lockedOrg.name }] }
    : await client
        .from('organizations')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

  // Fetch contacts for the requester autocomplete
  const { data: contacts } = await client
    .from('contacts')
    .select('id, name, email')
    .order('name', { ascending: true })
    .limit(500);

  return (
    <CreateTicketForm
      categories={categories ?? []}
      contacts={contacts ?? []}
      organizations={organizations ?? []}
      lockedOrganizationId={lockedOrg?.id ?? null}
    />
  );
}
