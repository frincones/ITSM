'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  submitFormSchema,
  type SubmitFormInput,
} from '~/lib/schemas/form.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> = { data: T; error: null } | { data: null; error: string };

/**
 * Authenticate the current user and resolve their contact record.
 * Portal users are contacts — not agents.
 */
async function requireContact(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { contact: null, user: null, error: 'Unauthorized' } as const;
  }

  const { data: contact } = await client
    .from('contacts')
    .select('id, tenant_id, email, name')
    .eq('user_id', user.id)
    .single();

  if (!contact) {
    return { contact: null, user, error: 'Contact not found' } as const;
  }

  return { contact, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// 1. getPortalTickets
// ---------------------------------------------------------------------------

/**
 * Fetches tickets for a portal user. Only returns tickets where the
 * contact is the requester (own tickets only).
 */
export async function getPortalTickets(
  contactEmail: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { contact, error: authError } = await requireContact(client);

    if (authError || !contact) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Ensure the user can only see their own tickets
    if (contact.email !== contactEmail) {
      return { data: null, error: 'Forbidden: can only view own tickets' };
    }

    const { data: tickets, error } = await client
      .from('tickets')
      .select(
        'id, ticket_number, title, status, type, urgency, priority, created_at, updated_at',
      )
      .eq('tenant_id', contact.tenant_id)
      .eq('contact_email', contact.email)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: tickets, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 2. createPortalTicket
// ---------------------------------------------------------------------------

/**
 * Creates a ticket from the portal with limited fields.
 * Portal users can only set title, description, type, and urgency.
 */
export async function createPortalTicket(
  input: { title: string; description: string; type?: string; urgency?: string },
): Promise<ActionResult> {
  try {
    const validated = z
      .object({
        title: z.string().trim().min(1, 'Title is required').max(255),
        description: z.string().trim().min(1, 'Description is required').max(10_000),
        type: z.enum(['incident', 'request', 'question']).default('request'),
        urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      })
      .parse(input);

    const client = getSupabaseServerClient();
    const { contact, user, error: authError } = await requireContact(client);

    if (authError || !contact || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .insert({
        title: validated.title,
        description: validated.description,
        type: validated.type,
        urgency: validated.urgency,
        status: 'new',
        source: 'portal',
        tenant_id: contact.tenant_id,
        contact_id: contact.id,
        contact_email: contact.email,
        created_by: user.id,
      })
      .select('id, ticket_number, title, status')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/portal/tickets');
    return { data: ticket, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 3. getPortalArticles
// ---------------------------------------------------------------------------

/**
 * Fetches published knowledge base articles visible to the public portal.
 * Only returns articles with visibility='public' and status='published'.
 */
export async function getPortalArticles(
  tenantSlug: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();

    // Resolve tenant from slug
    const { data: tenant } = await client
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (!tenant) {
      return { data: null, error: 'Tenant not found' };
    }

    const { data: articles, error } = await client
      .from('kb_articles')
      .select(
        'id, title, summary, category_id, tags, created_at, updated_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('visibility', 'public')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: articles, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// 4. submitForm
// ---------------------------------------------------------------------------

/**
 * Submits a service catalog form. Validates answers, stores them, and
 * creates a ticket with the form data attached.
 */
export async function submitForm(
  formId: string,
  answers: SubmitFormInput['answers'],
  contactId: string,
): Promise<ActionResult> {
  try {
    const validated = submitFormSchema.parse({
      form_id: formId,
      contact_id: contactId,
      answers,
    });

    const client = getSupabaseServerClient();
    const { contact, user, error: authError } = await requireContact(client);

    if (authError || !contact || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Ensure the contact matches
    if (contact.id !== validated.contact_id) {
      return { data: null, error: 'Forbidden: contact mismatch' };
    }

    // Load form to verify it exists and is active
    const { data: form } = await client
      .from('service_catalog_forms')
      .select('id, name, tenant_id, is_active, category_id')
      .eq('id', validated.form_id)
      .eq('tenant_id', contact.tenant_id)
      .single();

    if (!form) {
      return { data: null, error: 'Form not found' };
    }

    if (!form.is_active) {
      return { data: null, error: 'Form is not active' };
    }

    // Store form submission
    const { data: submission, error: subError } = await client
      .from('form_submissions')
      .insert({
        form_id: validated.form_id,
        contact_id: validated.contact_id,
        tenant_id: contact.tenant_id,
        answers: validated.answers,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (subError || !submission) {
      return { data: null, error: subError?.message ?? 'Failed to save submission' };
    }

    // Create a ticket from the form submission
    const { data: ticket, error: ticketError } = await client
      .from('tickets')
      .insert({
        title: `${form.name} — Form Submission`,
        description: `Form submission from ${contact.name ?? contact.email}.\nSubmission ID: ${submission.id}`,
        type: 'request',
        status: 'new',
        source: 'portal',
        urgency: 'medium',
        tenant_id: contact.tenant_id,
        contact_id: contact.id,
        contact_email: contact.email,
        category_id: form.category_id ?? null,
        created_by: user.id,
      })
      .select('id, ticket_number, title, status')
      .single();

    if (ticketError) {
      return { data: null, error: ticketError.message };
    }

    // Link submission to ticket
    await client
      .from('form_submissions')
      .update({ ticket_id: ticket.id })
      .eq('id', submission.id);

    revalidatePath('/portal/tickets');
    return {
      data: {
        submission_id: submission.id,
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
      },
      error: null,
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { data: null, error: err.errors.map((e) => e.message).join(', ') };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
