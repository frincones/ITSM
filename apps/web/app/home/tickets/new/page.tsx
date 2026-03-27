import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CreateTicketForm } from './_components/create-ticket-form';

export const metadata = {
  title: 'Create Ticket',
};

export default async function NewTicketPage() {
  const client = getSupabaseServerClient();

  // Fetch categories for the dropdown (RLS filters by tenant_id automatically)
  const { data: categories } = await client
    .from('categories')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  // Fetch organizations for the dropdown (RLS filters by tenant_id)
  const { data: organizations } = await client
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  // Fetch contacts for the requester autocomplete (RLS filters by tenant_id)
  const { data: contacts } = await client
    .from('contacts')
    .select('id, name, email')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(500);

  return (
    <CreateTicketForm
      categories={categories ?? []}
      contacts={contacts ?? []}
      organizations={organizations ?? []}
    />
  );
}
