'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  addMessage,
  getConversation,
  resolveConversation as resolveConversationService,
  linkConversationToTicket,
} from '~/lib/services/inbox.service';
import { processInboxMessage } from '~/lib/ai/agents/inbox';
import { getAdapter } from '~/lib/integrations/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAgent(client: ReturnType<typeof getSupabaseServerClient>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { agent: null, user: null, error: 'Unauthorized' } as const;
  }

  const { data: agent } = await client
    .from('agents')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return { agent: null, user, error: 'Agent not found' } as const;
  }

  return { agent, user, error: null } as const;
}

// ---------------------------------------------------------------------------
// 1. sendReply
// ---------------------------------------------------------------------------

/**
 * Sends an outbound reply on a conversation.
 *
 * - If `isInternal` is true the message is saved as an internal note
 *   (visible only to agents) and not dispatched through the channel.
 * - Otherwise the message is sent via the channel adapter and persisted.
 */
export async function sendReply(
  conversationId: string,
  content: string,
  isInternal = false,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch conversation with channel info
    const { data: conversation, error: convError } = await getConversation(
      client,
      conversationId,
    );

    if (convError || !conversation) {
      return { data: null, error: convError ?? 'Conversation not found' };
    }

    // Verify tenant isolation
    if (conversation.tenant_id !== agent.tenant_id) {
      return { data: null, error: 'Conversation not found' };
    }

    // For external replies, send through the channel adapter
    if (!isInternal && conversation.channel) {
      const adapter = getAdapter(
        conversation.channel.channel_type,
        conversation.channel.config,
      );

      if (adapter) {
        const { error: sendError } = await adapter.sendMessage(
          conversation,
          content,
        );

        if (sendError) {
          return { data: null, error: `Channel send failed: ${sendError}` };
        }
      }
    }

    // Persist the message
    const { data: message, error: msgError } = await addMessage(
      client,
      agent.tenant_id,
      conversationId,
      {
        from: user.email ?? agent.id,
        body: content,
        metadata: isInternal ? { is_internal: true } : {},
      },
      'outbound',
      'agent',
      agent.id,
    );

    if (msgError) {
      return { data: null, error: msgError };
    }

    revalidatePath('/home/inbox');
    revalidatePath(`/home/inbox/${conversationId}`);
    return { data: message, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. assignConversation
// ---------------------------------------------------------------------------

/**
 * Assigns a conversation to an agent and/or group.
 */
export async function assignConversation(
  conversationId: string,
  agentId?: string | null,
  groupId?: string | null,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify conversation belongs to tenant
    const { data: existing } = await client
      .from('inbox_conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Conversation not found' };
    }

    const updatePayload: Record<string, unknown> = {};

    if (agentId !== undefined) {
      updatePayload.assigned_agent_id = agentId;
    }

    if (groupId !== undefined) {
      updatePayload.assigned_group_id = groupId;
    }

    if (Object.keys(updatePayload).length === 0) {
      return { data: null, error: 'No assignment provided' };
    }

    const { data: updated, error } = await client
      .from('inbox_conversations')
      .update(updatePayload)
      .eq('id', conversationId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/inbox');
    revalidatePath(`/home/inbox/${conversationId}`);
    return { data: updated, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 3. resolveConversation
// ---------------------------------------------------------------------------

/**
 * Marks a conversation as resolved.
 */
export async function resolveConversation(
  conversationId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Verify tenant
    const { data: existing } = await client
      .from('inbox_conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Conversation not found' };
    }

    const { data, error } = await resolveConversationService(
      client,
      conversationId,
    );

    if (error) {
      return { data: null, error };
    }

    revalidatePath('/home/inbox');
    revalidatePath(`/home/inbox/${conversationId}`);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. createTicketFromConversation
// ---------------------------------------------------------------------------

/**
 * Creates a ticket from an inbox conversation using AI classification.
 *
 * Flow:
 *   1. Fetch the conversation and its most recent messages.
 *   2. Run the Inbox AI Agent for classification.
 *   3. Create the ticket with suggested metadata.
 *   4. Link the conversation to the new ticket.
 */
export async function createTicketFromConversation(
  conversationId: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, user, error: authError } = await requireAgent(client);

    if (authError || !agent || !user) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Fetch conversation
    const { data: conversation, error: convError } = await getConversation(
      client,
      conversationId,
    );

    if (convError || !conversation) {
      return { data: null, error: convError ?? 'Conversation not found' };
    }

    if (conversation.tenant_id !== agent.tenant_id) {
      return { data: null, error: 'Conversation not found' };
    }

    // Already linked?
    if (conversation.ticket_id) {
      return { data: null, error: 'Conversation is already linked to a ticket' };
    }

    // Fetch recent messages for AI context
    const { data: messages } = await client
      .from('inbox_messages')
      .select('content_text, direction, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const messageBody = (messages ?? [])
      .map((m: any) => `[${m.direction}] ${m.content_text ?? ''}`)
      .join('\n');

    // Run AI classification
    const channelType = conversation.channel?.channel_type ?? 'email';
    const aiChannel = channelType.startsWith('email') ? 'email' : channelType;

    const { data: classification } = await processInboxMessage({
      channel: aiChannel as any,
      from: conversation.subject ?? 'Unknown',
      subject: conversation.subject ?? undefined,
      body: messageBody,
      tenantId: agent.tenant_id,
    });

    // Build ticket payload
    const ticketData: Record<string, unknown> = {
      tenant_id: agent.tenant_id,
      created_by: user.id,
      status: 'new',
      title: classification?.suggested_ticket?.title ?? conversation.subject ?? 'Conversation ticket',
      description: classification?.suggested_ticket?.description ?? messageBody.slice(0, 2000),
      type: classification?.suggested_ticket?.type ?? 'request',
      urgency: classification?.urgency ?? 'medium',
      source: 'inbox',
    };

    // If conversation has an assigned agent/group, carry over
    if (conversation.assigned_agent_id) {
      ticketData.assigned_agent_id = conversation.assigned_agent_id;
      ticketData.status = 'assigned';
    }

    if (conversation.assigned_group_id) {
      ticketData.assigned_group_id = conversation.assigned_group_id;
    }

    // Fetch channel defaults
    if (conversation.channel) {
      const { data: channelData } = await client
        .from('inbox_channels')
        .select('default_category_id, default_group_id')
        .eq('id', conversation.channel_id)
        .single();

      if (channelData?.default_category_id && !ticketData.category_id) {
        ticketData.category_id = channelData.default_category_id;
      }

      if (channelData?.default_group_id && !ticketData.assigned_group_id) {
        ticketData.assigned_group_id = channelData.default_group_id;
      }
    }

    // Create ticket
    const { data: ticket, error: ticketError } = await client
      .from('tickets')
      .insert(ticketData)
      .select()
      .single();

    if (ticketError) {
      return { data: null, error: ticketError.message };
    }

    // Link conversation to ticket
    await linkConversationToTicket(client, conversationId, ticket.id);

    // Store AI classification on conversation
    if (classification) {
      await client
        .from('inbox_conversations')
        .update({ ai_summary: classification.summary })
        .eq('id', conversationId);
    }

    revalidatePath('/home/inbox');
    revalidatePath('/home/tickets');
    revalidatePath(`/home/inbox/${conversationId}`);
    return { data: ticket, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 5. snoozeConversation
// ---------------------------------------------------------------------------

/**
 * Snoozes a conversation until a specified date/time.
 * The conversation status is set to 'snoozed' and a `snoozed_until`
 * timestamp is stored in metadata.
 */
export async function snoozeConversation(
  conversationId: string,
  until: string,
): Promise<ActionResult> {
  try {
    const client = getSupabaseServerClient();
    const { agent, error: authError } = await requireAgent(client);

    if (authError || !agent) {
      return { data: null, error: authError ?? 'Unauthorized' };
    }

    // Validate the snooze date
    const snoozeDate = new Date(until);
    if (isNaN(snoozeDate.getTime())) {
      return { data: null, error: 'Invalid snooze date' };
    }

    if (snoozeDate.getTime() <= Date.now()) {
      return { data: null, error: 'Snooze date must be in the future' };
    }

    // Verify tenant
    const { data: existing } = await client
      .from('inbox_conversations')
      .select('id, tenant_id, metadata')
      .eq('id', conversationId)
      .eq('tenant_id', agent.tenant_id)
      .single();

    if (!existing) {
      return { data: null, error: 'Conversation not found' };
    }

    const currentMetadata =
      (existing.metadata as Record<string, unknown>) ?? {};

    const { data: updated, error } = await client
      .from('inbox_conversations')
      .update({
        status: 'snoozed',
        metadata: {
          ...currentMetadata,
          snoozed_until: until,
          snoozed_by: agent.id,
        },
      })
      .eq('id', conversationId)
      .eq('tenant_id', agent.tenant_id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/home/inbox');
    revalidatePath(`/home/inbox/${conversationId}`);
    return { data: updated, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
