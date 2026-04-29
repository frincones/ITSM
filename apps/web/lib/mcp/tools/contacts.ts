// ---------------------------------------------------------------------------
// MCP Tools — Contacts (end users / requesters)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { notFound } from '../errors';
import { registry } from '../registry';
import {
  PaginationInput,
  buildPaginationOutput,
  rangeFromPagination,
} from '../schemas';

const CONTACT_COLUMNS =
  'id, name, email, phone, whatsapp_id, company, avatar_url, channel_identifiers, metadata, created_at, updated_at';

registry.register({
  name: 'contacts.list',
  description: 'List contacts (end users / requesters) in the tenant.',
  scope: 'contacts:read',
  inputSchema: PaginationInput.extend({
    search: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().optional(),
  }),
  meta: { since: '1.0.0', tags: ['contacts', 'read'] },
  async handler(ctx, input) {
    const { from, to } = rangeFromPagination(input);

    let q = ctx.supabase
      .from('contacts')
      .select(CONTACT_COLUMNS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (input.email) q = q.eq('email', input.email);

    if (input.search) {
      const safe = input.search.replace(/[%_,]/g, ' ').trim();
      q = q.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%`);
    }

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { data: data ?? [], pagination: buildPaginationOutput(input, count) };
  },
});

registry.register({
  name: 'contacts.get',
  description: 'Get a contact by id or email.',
  scope: 'contacts:read',
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    email: z.string().email().optional(),
  }).refine((v) => v.id || v.email, { message: 'Either id or email is required' }),
  meta: { since: '1.0.0', tags: ['contacts', 'read'] },
  async handler(ctx, input) {
    let q = ctx.supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('tenant_id', ctx.tenantId);
    if (input.id) q = q.eq('id', input.id);
    else if (input.email) q = q.eq('email', input.email);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('Contact');
    return { contact: data };
  },
});

registry.register({
  name: 'contacts.upsert',
  description: 'Create a contact or update it if a contact with the same email already exists in the tenant.',
  scope: 'contacts:write',
  inputSchema: z.object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(255).optional(),
    phone: z.string().max(50).optional(),
    whatsapp_id: z.string().max(50).optional(),
    company: z.string().max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  meta: { since: '1.0.0', tags: ['contacts', 'write'] },
  async handler(ctx, input) {
    const { data: existing, error: findErr } = await ctx.supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('email', input.email)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (existing) {
      const existingId = (existing as unknown as { id: string }).id;
      const { data, error } = await ctx.supabase
        .from('contacts')
        .update({
          name: input.name,
          phone: input.phone,
          whatsapp_id: input.whatsapp_id,
          company: input.company,
          metadata: input.metadata,
        })
        .eq('id', existingId)
        .eq('tenant_id', ctx.tenantId)
        .select(CONTACT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { contact: data, created: false };
    }

    const { data, error } = await ctx.supabase
      .from('contacts')
      .insert({
        tenant_id: ctx.tenantId,
        email: input.email,
        name: input.name ?? null,
        phone: input.phone ?? null,
        whatsapp_id: input.whatsapp_id ?? null,
        company: input.company ?? null,
        metadata: input.metadata ?? {},
      })
      .select(CONTACT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { contact: data, created: true };
  },
});
