import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createConversation,
  addMessage,
  getOrCreateContact,
  findChannelByType,
} from '~/lib/services/inbox.service';
import { processInboxMessage } from '~/lib/ai/agents/inbox';
import { getAdapter } from '~/lib/integrations/registry';

// ---------------------------------------------------------------------------
// POST /api/v1/inbox/webhooks/[channel]
// ---------------------------------------------------------------------------

/**
 * Receives inbound webhooks from any channel adapter.
 *
 * The `[channel]` param maps to `inbox_channels.channel_type`:
 *   - email_imap
 *   - email_office365
 *   - whatsapp
 *   - web_widget
 *
 * Flow:
 *   1. Identify the channel adapter from the URL param.
 *   2. Verify the request signature (adapter-specific).
 *   3. Parse the payload into a NormalizedMessage.
 *   4. Find or create the contact.
 *   5. Find or create the conversation.
 *   6. Persist the message.
 *   7. Optionally run AI classification.
 *   8. Return 200 OK.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel: channelType } = await params;

  // ── Resolve tenant ──────────────────────────────────────────────────────
  // Inbound webhooks must identify the tenant.  We support:
  //   - Query param: ?tenant_id=...
  //   - Query param: ?channel_id=...  (channel already has tenant_id)
  const tenantId = request.nextUrl.searchParams.get('tenant_id');
  const channelId = request.nextUrl.searchParams.get('channel_id');

  if (!tenantId && !channelId) {
    return NextResponse.json(
      { error: 'Missing tenant_id or channel_id query parameter' },
      { status: 400 },
    );
  }

  try {
    const client = getSupabaseServerClient();

    // ── Resolve the inbox channel ─────────────────────────────────────────
    let resolvedChannel: {
      id: string;
      tenant_id: string;
      channel_type: string;
      config: Record<string, unknown>;
      is_active: boolean;
      auto_create_ticket: boolean;
      ai_processing: boolean;
      default_category_id: string | null;
      default_group_id: string | null;
    };

    if (channelId) {
      const { data: ch, error: chError } = await client
        .from('inbox_channels')
        .select('*')
        .eq('id', channelId)
        .eq('is_active', true)
        .single();

      if (chError || !ch) {
        return NextResponse.json(
          { error: 'Channel not found or inactive' },
          { status: 404 },
        );
      }

      resolvedChannel = ch as any;
    } else {
      const { data: ch, error: chError } = await findChannelByType(
        client,
        tenantId!,
        channelType,
      );

      if (chError || !ch) {
        return NextResponse.json(
          { error: chError ?? 'No active channel found for this type' },
          { status: 404 },
        );
      }

      resolvedChannel = ch;
    }

    const effectiveTenantId = resolvedChannel.tenant_id;

    // ── Get adapter and verify signature ──────────────────────────────────
    const adapter = getAdapter(channelType, resolvedChannel.config);

    if (!adapter) {
      return NextResponse.json(
        { error: `Unsupported channel type: ${channelType}` },
        { status: 400 },
      );
    }

    const isValid = await adapter.verifySignature(request);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 },
      );
    }

    // ── Parse payload ─────────────────────────────────────────────────────
    const rawPayload = await request.json();
    const normalizedMessage = await adapter.handleInboundWebhook(rawPayload);

    // ── Find or create contact ────────────────────────────────────────────
    const contactIdentifier = buildContactIdentifier(
      channelType,
      normalizedMessage,
    );

    const { data: contact } = await getOrCreateContact(
      client,
      effectiveTenantId,
      contactIdentifier,
    );

    // ── Find existing open conversation or create new ─────────────────────
    let conversationId: string;

    // Try to find an existing open conversation for this contact + channel
    const { data: existingConv } = await client
      .from('inbox_conversations')
      .select('id')
      .eq('tenant_id', effectiveTenantId)
      .eq('channel_id', resolvedChannel.id)
      .eq('contact_id', contact?.id ?? '')
      .in('status', ['open', 'pending', 'snoozed'])
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;

      // Re-open if snoozed
      await client
        .from('inbox_conversations')
        .update({ status: 'open' })
        .eq('id', conversationId)
        .eq('status', 'snoozed');
    } else {
      const { data: newConv, error: convError } = await createConversation(
        client,
        effectiveTenantId,
        resolvedChannel.id,
        contact?.id ?? null,
        normalizedMessage.subject,
      );

      if (convError || !newConv) {
        return NextResponse.json(
          { error: convError ?? 'Failed to create conversation' },
          { status: 500 },
        );
      }

      conversationId = newConv.id;
    }

    // ── Persist message ───────────────────────────────────────────────────
    const { data: message, error: msgError } = await addMessage(
      client,
      effectiveTenantId,
      conversationId,
      normalizedMessage,
      'inbound',
      'contact',
      contact?.id,
    );

    if (msgError) {
      return NextResponse.json(
        { error: `Failed to save message: ${msgError}` },
        { status: 500 },
      );
    }

    // ── AI classification (non-blocking) ──────────────────────────────────
    let aiClassification: Record<string, unknown> | null = null;

    if (resolvedChannel.ai_processing) {
      try {
        const aiChannel = channelType.startsWith('email')
          ? 'email'
          : channelType === 'web_widget'
            ? 'chat'
            : channelType;

        const { data: classification } = await processInboxMessage({
          channel: aiChannel as any,
          from: normalizedMessage.from,
          subject: normalizedMessage.subject,
          body: normalizedMessage.body,
          tenantId: effectiveTenantId,
        });

        if (classification) {
          aiClassification = classification as unknown as Record<string, unknown>;

          // Store classification on the message
          await client
            .from('inbox_messages')
            .update({ ai_classification: aiClassification })
            .eq('id', message!.id);

          // Update conversation AI summary
          await client
            .from('inbox_conversations')
            .update({ ai_summary: classification.summary })
            .eq('id', conversationId);

          // Auto-create ticket if configured and AI recommends it
          if (
            resolvedChannel.auto_create_ticket &&
            classification.action === 'create_ticket' &&
            classification.confidence >= 0.7
          ) {
            await autoCreateTicket(
              client,
              effectiveTenantId,
              conversationId,
              classification,
              resolvedChannel,
            );
          }
        }
      } catch (aiErr) {
        // AI errors are non-fatal — log and continue
        console.error('[inbox-webhook] AI classification error:', aiErr);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        conversation_id: conversationId,
        message_id: message?.id,
        ai_classification: aiClassification,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[inbox-webhook] Error processing webhook:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/inbox/webhooks/[channel]
// ---------------------------------------------------------------------------

/**
 * Handles webhook verification requests.
 *
 * WhatsApp Cloud API sends a GET with:
 *   - hub.mode=subscribe
 *   - hub.challenge=<random_string>
 *   - hub.verify_token=<your_verify_token>
 *
 * Microsoft Graph sends a POST with `validationToken` query param.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel: channelType } = await params;

  // ── WhatsApp verification ───────────────────────────────────────────────
  if (channelType === 'whatsapp') {
    const mode = request.nextUrl.searchParams.get('hub.mode');
    const challenge = request.nextUrl.searchParams.get('hub.challenge');
    const verifyToken = request.nextUrl.searchParams.get('hub.verify_token');

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 },
      );
    }

    // Look up the channel to validate the verify_token
    const channelId = request.nextUrl.searchParams.get('channel_id');
    const tenantId = request.nextUrl.searchParams.get('tenant_id');

    if (!channelId && !tenantId) {
      return NextResponse.json(
        { error: 'Missing channel_id or tenant_id' },
        { status: 400 },
      );
    }

    try {
      const client = getSupabaseServerClient();
      let channelConfig: Record<string, unknown> | null = null;

      if (channelId) {
        const { data } = await client
          .from('inbox_channels')
          .select('config')
          .eq('id', channelId)
          .single();
        channelConfig = data?.config as Record<string, unknown> | null;
      } else {
        const { data } = await client
          .from('inbox_channels')
          .select('config')
          .eq('tenant_id', tenantId!)
          .eq('channel_type', 'whatsapp')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        channelConfig = data?.config as Record<string, unknown> | null;
      }

      if (!channelConfig) {
        return NextResponse.json(
          { error: 'Channel not found' },
          { status: 404 },
        );
      }

      if (channelConfig.verify_token !== verifyToken) {
        return NextResponse.json(
          { error: 'Verify token mismatch' },
          { status: 403 },
        );
      }

      // Return the challenge as plain text (WhatsApp requirement)
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch {
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 500 },
      );
    }
  }

  // ── Office 365 Graph validation ─────────────────────────────────────────
  if (channelType === 'email_office365') {
    const validationToken = request.nextUrl.searchParams.get('validationToken');

    if (validationToken) {
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  return NextResponse.json(
    { error: 'Unsupported verification request' },
    { status: 400 },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a contact identifier from the normalized message based on channel.
 */
function buildContactIdentifier(
  channelType: string,
  message: { from: string; metadata?: Record<string, unknown> },
): { email?: string; phone?: string; whatsapp_id?: string; name?: string } {
  switch (channelType) {
    case 'whatsapp': {
      const waId =
        (message.metadata?.wa_id as string) ?? message.from;
      const name = message.metadata?.contact_name as string | undefined;
      return { whatsapp_id: waId, name };
    }

    case 'email_imap':
    case 'email_office365':
    case 'email_gmail': {
      // Parse "Name <email>" format
      const emailMatch = message.from.match(/<([^>]+)>/);
      const email = emailMatch ? emailMatch[1] : message.from;
      const name = emailMatch
        ? message.from.replace(/<[^>]+>/, '').trim()
        : undefined;
      return { email, name: name || undefined };
    }

    case 'web_widget': {
      const email = message.metadata?.email as string | undefined;
      const name = message.metadata?.name as string | undefined;
      const visitorId = message.metadata?.visitor_id as string | undefined;
      return {
        email: email || undefined,
        name: name || visitorId || message.from,
      };
    }

    default:
      return { email: message.from };
  }
}

/**
 * Auto-creates a ticket from an AI-classified conversation.
 */
async function autoCreateTicket(
  client: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  conversationId: string,
  classification: {
    suggested_ticket?: {
      title: string;
      description: string;
      type: string;
      urgency: string;
      category: string;
    };
    urgency: string;
    summary: string;
  },
  channel: {
    default_category_id: string | null;
    default_group_id: string | null;
  },
) {
  try {
    const ticketData: Record<string, unknown> = {
      tenant_id: tenantId,
      status: 'new',
      title: classification.suggested_ticket?.title ?? classification.summary,
      description:
        classification.suggested_ticket?.description ?? classification.summary,
      type: classification.suggested_ticket?.type ?? 'request',
      urgency: classification.urgency ?? 'medium',
      source: 'inbox',
    };

    if (channel.default_category_id) {
      ticketData.category_id = channel.default_category_id;
    }

    if (channel.default_group_id) {
      ticketData.assigned_group_id = channel.default_group_id;
      ticketData.status = 'assigned';
    }

    const { data: ticket, error } = await client
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single();

    if (error || !ticket) {
      console.error('[inbox-webhook] Auto-create ticket failed:', error);
      return;
    }

    // Link conversation to ticket
    await client
      .from('inbox_conversations')
      .update({ ticket_id: ticket.id })
      .eq('id', conversationId);
  } catch (err) {
    console.error('[inbox-webhook] Auto-create ticket error:', err);
  }
}
