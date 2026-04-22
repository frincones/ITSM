'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * Three kinds of mentionable principals exist in NovaDesk:
 *   - staff        → agents with role IN (admin, supervisor, agent).
 *                    Internal, silent follow, no CC on emails.
 *   - client_user  → agents with role='readonly' linked to the ticket's
 *                    organization via organization_users. These are the
 *                    "portal users" of the client — they DO have a login.
 *   - contact      → rows in the `contacts` table. External people we
 *                    reach by email / whatsapp / widget. No login.
 *
 * staff + client_user both live in the `agents` table, so their IDs flow
 * into `mentioned_agent_ids`. contact IDs flow into `mentioned_contact_ids`.
 * The CC list for an outbound email is built from client_user + contact
 * emails (staff is never CC'd — they're internal watchers).
 */
export type MentionableKind = 'staff' | 'client_user' | 'contact';

export interface MentionableItem {
  kind: MentionableKind;
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role?: string | null;
}

export interface MentionablesResult {
  agents: MentionableItem[];
  /** Contacts linked to the ticket's organization. */
  contacts: MentionableItem[];
  /** Tenant contacts that have no organization_id — surfaced as a fallback
   * when the ticket's org is sparsely populated, so agents can still reach
   * the right person even if data hygiene is incomplete. */
  otherContacts: MentionableItem[];
  orgName: string | null;
}

const searchSchema = z.object({
  ticketId: z.string().uuid(),
  query: z.string().trim().max(100).optional().default(''),
  includeContacts: z.boolean().optional().default(true),
});

const LIST_LIMIT = 25;

/**
 * Lists agents (staff) and contacts (client users) the current user can
 * @mention on this ticket. Contacts are scoped to the ticket's organization
 * so a public reply only offers people who legitimately belong to that
 * customer account.
 *
 * The caller should pass includeContacts=false for internal notes — per
 * product rule, contacts must never learn they're being discussed
 * internally, so they never appear in the internal-note picker.
 */
export async function searchMentionables(
  input: z.input<typeof searchSchema>,
): Promise<{ data: MentionablesResult | null; error: string | null }> {
  try {
    const { ticketId, query, includeContacts } = searchSchema.parse(input);
    const client = getSupabaseServerClient();

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    const { data: agent } = await client
      .from('agents')
      .select('id, tenant_id, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!agent) return { data: null, error: 'Agent not found' };

    // Resolve ticket → organization_id (plus the org's display name so the
    // dropdown header can say "Contactos de Podenza" instead of a generic
    // "Contactos del cliente").
    const { data: ticket } = await client
      .from('tickets')
      .select('id, tenant_id, organization_id, requester_id, organization:organizations(id,name)')
      .eq('id', ticketId)
      .eq('tenant_id', agent.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!ticket) return { data: null, error: 'Ticket not found' };

    const orgName = (
      ticket as unknown as { organization?: { name: string | null } | null }
    ).organization?.name ?? null;

    const like = query ? `%${query}%` : null;

    // ── 1. Staff agents of the tenant (admin / supervisor / agent) ──
    let agentsQb = client
      .from('agents')
      .select('id, name, email, avatar_url, role, user_id')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
      .neq('id', agent.id)
      .in('role', ['admin', 'supervisor', 'agent'])
      .order('name', { ascending: true })
      .limit(LIST_LIMIT);
    if (like) agentsQb = agentsQb.or(`name.ilike.${like},email.ilike.${like}`);
    const { data: staffRows } = await agentsQb;

    const agents: MentionableItem[] = (staffRows ?? []).map((a) => ({
      kind: 'staff',
      id: a.id as string,
      name: (a.name as string | null) ?? 'Sin nombre',
      email: (a.email as string | null) ?? null,
      avatarUrl: (a.avatar_url as string | null) ?? null,
      role: (a.role as string | null) ?? null,
    }));

    // ── 2 + 3. Client-side users of this ticket's organization ──
    // These are users the customer can see in the email. We union:
    //   (a) contacts rows linked to the org via organization_id
    //   (b) readonly agents linked to the org via organization_users
    let contacts: MentionableItem[] = [];
    let otherContacts: MentionableItem[] = [];

    if (includeContacts) {
      if (ticket.organization_id) {
        // (a) contacts with organization_id = ticket.org_id
        let contactsQb = client
          .from('contacts')
          .select('id, name, email, avatar_url')
          .eq('tenant_id', agent.tenant_id)
          .eq('organization_id', ticket.organization_id)
          .order('name', { ascending: true })
          .limit(LIST_LIMIT);
        if (like) contactsQb = contactsQb.or(`name.ilike.${like},email.ilike.${like}`);
        const { data: contactRows } = await contactsQb;
        const orgContacts = (contactRows ?? []).map(toContactItem);

        // (b) readonly agents linked to the org via organization_users
        const clientUsers = await loadClientUsersForOrg(
          client,
          agent.tenant_id,
          ticket.organization_id,
          agent.id,
          like,
        );

        // Merge + dedupe by email (a person with both a contact row AND a
        // portal login shouldn't appear twice). Portal users take
        // precedence when both exist because they have a real login and
        // receive proper in-app notifications.
        const seen = new Set<string>();
        const merged: MentionableItem[] = [];
        for (const u of clientUsers) {
          const key = (u.email ?? `id:${u.id}`).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(u);
        }
        for (const c of orgContacts) {
          const key = (c.email ?? `id:${c.id}`).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(c);
        }
        merged.sort((x, y) => x.name.localeCompare(y.name));
        contacts = merged;

        // Fallback: contacts without any organization_id (tenant-scoped).
        let otherQb = client
          .from('contacts')
          .select('id, name, email, avatar_url')
          .eq('tenant_id', agent.tenant_id)
          .is('organization_id', null)
          .order('name', { ascending: true })
          .limit(LIST_LIMIT);
        if (like) otherQb = otherQb.or(`name.ilike.${like},email.ilike.${like}`);
        const { data: otherRows } = await otherQb;
        otherContacts = (otherRows ?? []).map(toContactItem);
      } else {
        // No org on the ticket — show every tenant contact.
        let contactsQb = client
          .from('contacts')
          .select('id, name, email, avatar_url')
          .eq('tenant_id', agent.tenant_id)
          .order('name', { ascending: true })
          .limit(LIST_LIMIT);
        if (like) contactsQb = contactsQb.or(`name.ilike.${like},email.ilike.${like}`);
        const { data: contactRows } = await contactsQb;
        contacts = (contactRows ?? []).map(toContactItem);
      }
    }

    return { data: { agents, contacts, otherContacts, orgName }, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

function toContactItem(c: {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}): MentionableItem {
  return {
    kind: 'contact',
    id: c.id,
    name: c.name ?? 'Sin nombre',
    email: c.email ?? null,
    avatarUrl: c.avatar_url ?? null,
  };
}

/**
 * Loads the "portal users" of an organization — agents with role='readonly'
 * linked to the org through organization_users. These people have a login
 * and get in-app notifications; for mention purposes they act like client
 * contacts (CC'd on emails, visible to the requester).
 */
async function loadClientUsersForOrg(
  client: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  organizationId: string,
  selfAgentId: string,
  like: string | null,
): Promise<MentionableItem[]> {
  // Resolve user_ids linked to this organization.
  const { data: links } = await client
    .from('organization_users')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .not('user_id', 'is', null);

  const userIds = ((links ?? []) as Array<{ user_id: string | null }>)
    .map((r) => r.user_id)
    .filter((id): id is string => Boolean(id));

  if (userIds.length === 0) return [];

  let agentsQb = client
    .from('agents')
    .select('id, name, email, avatar_url, role, user_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .neq('id', selfAgentId)
    .eq('role', 'readonly')
    .in('user_id', userIds)
    .order('name', { ascending: true })
    .limit(LIST_LIMIT);
  if (like) agentsQb = agentsQb.or(`name.ilike.${like},email.ilike.${like}`);
  const { data: rows } = await agentsQb;

  return ((rows ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string | null;
  }>).map((a) => ({
    kind: 'client_user',
    id: a.id,
    name: a.name ?? 'Sin nombre',
    email: a.email ?? null,
    avatarUrl: a.avatar_url ?? null,
    role: a.role ?? null,
  }));
}
