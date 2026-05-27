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

  // Resolve "who is creating this ticket" so the form can default the
  // Requester field to the current user. We need: the email Auth knows
  // about, plus (if it exists) the matching row in our domain tables —
  // either an agents row or an organization_users row — so the list view
  // can render the requester's display name instead of just the raw email.
  let lockedOrg: { id: string; name: string } | null = null;
  let defaultRequester: {
    email: string;
    name: string | null;
    contactId: string | null;
  } | null = null;

  if (user) {
    const { data: agent } = await client
      .from('agents')
      .select('id, name, email, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    const isClient = !agent || agent.role === 'readonly';

    if (isClient) {
      const { data: orgUser } = await client
        .from('organization_users')
        .select('email, name, organization:organizations(id, name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      const org = (orgUser?.organization ?? null) as
        | { id: string; name: string }
        | null;
      if (org) lockedOrg = org;

      // Try to surface a contact row matching the user (by email + same
      // tenant via org). Not every portal user has one — that's fine,
      // requester_id stays null and we go with email only.
      const portalEmail = orgUser?.email ?? user.email ?? null;
      let contactId: string | null = null;
      if (portalEmail && org) {
        const { data: contactMatch } = await client
          .from('contacts')
          .select('id')
          .eq('organization_id', org.id)
          .ilike('email', portalEmail)
          .limit(1)
          .maybeSingle();
        contactId = contactMatch?.id ?? null;
      }

      if (portalEmail) {
        defaultRequester = {
          email: portalEmail,
          name: (orgUser?.name as string | null) ?? null,
          contactId,
        };
      }
    } else if (agent?.email) {
      defaultRequester = {
        email: agent.email as string,
        name: (agent.name as string | null) ?? null,
        contactId: null,
      };
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
      defaultRequester={defaultRequester}
    />
  );
}
