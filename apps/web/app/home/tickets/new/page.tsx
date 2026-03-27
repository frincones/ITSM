import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CreateTicketForm } from './_components/create-ticket-form';

export const metadata = {
  title: 'Create Ticket',
};

export default async function NewTicketPage() {
  const client = getSupabaseServerClient();

  // Fetch categories for the dropdown
  const { data: categories } = await client
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  // Fetch organizations for the dropdown
  const { data: organizations } = await client
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
    />
  );
}
