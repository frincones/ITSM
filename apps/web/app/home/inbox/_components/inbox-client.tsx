'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  MessageSquare,
  Phone,
  Globe,
  Send,
  Search,
  Paperclip,
  Bot,
  Clock,
  UserPlus,
  CheckCircle,
  AlarmClock,
  TicketPlus,
  Inbox,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Separator } from '@kit/ui/separator';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InboxChannel {
  id: string;
  name: string;
  channel_type: string;
}

interface InboxContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface InboxAgent {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface InboxMessage {
  id: string;
  direction: string;
  sender_type: string;
  content_text: string | null;
  attachments: unknown[];
  ai_classification: unknown;
  created_at: string;
}

interface LastMessage {
  id: string;
  direction: string;
  sender_type: string;
  content_text: string | null;
  attachments: unknown[];
  ai_classification: Record<string, unknown> | null;
  created_at: string;
}

interface Conversation {
  id: string;
  status: string;
  subject: string | null;
  last_message_at: string | null;
  assigned_agent_id: string | null;
  ai_summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  channel: InboxChannel | null;
  contact: InboxContact | null;
  assigned_agent: InboxAgent | null;
  last_message: LastMessage | null;
}

interface InboxClientProps {
  conversations: Conversation[];
  currentAgentId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChannelIcon(channelType: string) {
  switch (channelType) {
    case 'email_imap':
    case 'email_office365':
    case 'email_gmail':
      return Mail;
    case 'whatsapp':
      return MessageSquare;
    case 'web_widget':
    case 'web_form':
      return Globe;
    case 'phone':
      return Phone;
    default:
      return MessageSquare;
  }
}

function getChannelColor(channelType: string) {
  if (channelType.startsWith('email')) return 'bg-blue-100 text-blue-700';
  if (channelType === 'whatsapp') return 'bg-green-100 text-green-700';
  if (channelType.startsWith('web')) return 'bg-purple-100 text-purple-700';
  if (channelType === 'phone') return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-700';
}

function getChannelLabel(channelType: string) {
  const labels: Record<string, string> = {
    email_imap: 'Email',
    email_office365: 'Office 365',
    email_gmail: 'Gmail',
    whatsapp: 'WhatsApp',
    web_widget: 'Widget',
    web_form: 'Web Form',
    api: 'API',
    phone: 'Phone',
  };
  return labels[channelType] || channelType;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    snoozed: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimeAgo(date: string | null) {
  if (!date) return '';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: false });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// ChannelIcon Component
// ---------------------------------------------------------------------------

function ChannelIconBadge({ channelType }: { channelType: string }) {
  const Icon = getChannelIcon(channelType);
  return (
    <Badge className={`text-xs ${getChannelColor(channelType)}`}>
      <Icon className="mr-1 h-3 w-3" />
      {getChannelLabel(channelType)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble Component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: InboxMessage }) {
  const isOutbound = message.direction === 'outbound';
  const isAI = message.sender_type === 'ai_agent';
  const isAgent = message.sender_type === 'agent';
  const attachments = (message.attachments ?? []) as Array<{
    name?: string;
    filename?: string;
  }>;

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-2xl rounded-lg p-4 shadow-sm ${
          isAgent
            ? 'bg-indigo-600 text-white'
            : isAI
              ? 'border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50'
              : 'border border-gray-200 bg-white'
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          {isAI && <Bot className="h-4 w-4 text-purple-600" />}
          <span
            className={`text-sm font-medium ${
              isAgent
                ? 'text-white'
                : isAI
                  ? 'text-purple-700'
                  : 'text-gray-900'
            }`}
          >
            {isAgent ? 'You' : isAI ? 'AI Assistant' : 'Contact'}
          </span>
          {isAI && (
            <Badge className="bg-purple-100 text-xs text-purple-700">AI</Badge>
          )}
          <span
            className={`ml-auto text-xs ${
              isAgent ? 'text-indigo-200' : 'text-gray-500'
            }`}
          >
            {formatTimeAgo(message.created_at)}
          </span>
        </div>
        <p
          className={`text-sm ${
            isAgent ? 'text-white' : 'text-gray-700'
          }`}
        >
          {message.content_text}
        </p>
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <Badge key={idx} className="bg-gray-100 text-xs text-gray-700">
                <Paperclip className="mr-1 h-3 w-3" />
                {att.name || att.filename || 'Attachment'}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InboxClient({
  conversations: initialConversations,
  currentAgentId,
}: InboxClientProps) {
  const supabase = useSupabase();
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [replyText, setReplyText] = useState('');
  const [isSending, startSendTransition] = useTransition();
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find(
    (c) => c.id === selectedId,
  );

  // ---------------------------------------------------------------------------
  // Fetch messages for selected conversation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);

    supabase
      .from('inbox_messages')
      .select(
        'id, direction, sender_type, content_text, attachments, ai_classification, created_at',
      )
      .eq('conversation_id', selectedId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setMessages((data as InboxMessage[]) ?? []);
        setIsLoadingMessages(false);
      });
  }, [selectedId, supabase]);

  // ---------------------------------------------------------------------------
  // Scroll to bottom on new messages
  // ---------------------------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime for new messages
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
        },
        (payload) => {
          const newMsg = payload.new as InboxMessage & {
            conversation_id: string;
          };

          // Add message to thread if it belongs to selected conversation
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }

          // Update conversation list (move to top, update last_message)
          setConversations((prev) => {
            const updated = prev.map((conv) => {
              if (conv.id === newMsg.conversation_id) {
                return {
                  ...conv,
                  last_message_at: newMsg.created_at,
                  last_message: {
                    id: newMsg.id,
                    direction: newMsg.direction,
                    sender_type: newMsg.sender_type,
                    content_text: newMsg.content_text,
                    attachments: newMsg.attachments,
                    ai_classification: null,
                    created_at: newMsg.created_at,
                  },
                };
              }
              return conv;
            });
            return updated.sort((a, b) => {
              const aTime = a.last_message_at
                ? new Date(a.last_message_at).getTime()
                : 0;
              const bTime = b.last_message_at
                ? new Date(b.last_message_at).getTime()
                : 0;
              return bTime - aTime;
            });
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inbox_conversations',
        },
        (payload) => {
          const updated = payload.new as Conversation;
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === updated.id
                ? { ...conv, status: updated.status, subject: updated.subject }
                : conv,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedId]);

  // ---------------------------------------------------------------------------
  // Send reply
  // ---------------------------------------------------------------------------

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedId) return;

    const text = replyText.trim();
    setReplyText('');

    startSendTransition(async () => {
      await supabase.from('inbox_messages').insert({
        conversation_id: selectedId,
        direction: 'outbound',
        sender_type: 'agent',
        sender_id: currentAgentId,
        content_text: text,
      });

      // Update conversation last_message_at
      await supabase
        .from('inbox_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedId);
    });
  };

  // ---------------------------------------------------------------------------
  // Filter conversations
  // ---------------------------------------------------------------------------

  const filteredConversations = conversations.filter((conv) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesContact =
        conv.contact?.name?.toLowerCase().includes(q) ||
        conv.contact?.email?.toLowerCase().includes(q);
      const matchesSubject = conv.subject?.toLowerCase().includes(q);
      const matchesPreview = conv.last_message?.content_text
        ?.toLowerCase()
        .includes(q);
      if (!matchesContact && !matchesSubject && !matchesPreview) return false;
    }

    // Tab filter
    switch (activeTab) {
      case 'unread':
        return conv.status === 'open' && conv.last_message?.direction === 'inbound';
      case 'mine':
        return conv.assigned_agent_id === currentAgentId;
      case 'unassigned':
        return !conv.assigned_agent_id;
      default:
        return true;
    }
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ─── LEFT PANEL: Conversation List ─── */}
      <div className="flex w-96 flex-col border-r border-gray-200 bg-white">
        {/* Header & Search */}
        <div className="border-b border-gray-200 p-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Omnichannel Inbox
          </h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              className="bg-gray-50 pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="mine">Mine</TabsTrigger>
              <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
              <Inbox className="h-10 w-10" />
              <p className="text-sm">No conversations found</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedId === conv.id;
              const isUnread =
                conv.status === 'open' &&
                conv.last_message?.direction === 'inbound';

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`cursor-pointer border-b border-gray-200 p-4 transition-colors hover:bg-gray-50 ${
                    isSelected
                      ? 'border-l-4 border-l-indigo-600 bg-indigo-50'
                      : ''
                  } ${isUnread && !isSelected ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      {conv.contact?.avatar_url ? (
                        <AvatarImage
                          src={conv.contact.avatar_url}
                          alt={conv.contact.name ?? ''}
                        />
                      ) : null}
                      <AvatarFallback className="bg-gray-100 text-sm">
                        {getInitials(conv.contact?.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <h4 className="truncate text-sm font-medium text-gray-900">
                          {conv.contact?.name ?? 'Unknown Contact'}
                        </h4>
                        <span className="ml-2 flex-shrink-0 text-xs text-gray-500">
                          {formatTimeAgo(conv.last_message_at)}
                        </span>
                      </div>

                      <p className="mb-1 truncate text-sm font-medium text-gray-700">
                        {conv.subject ?? 'No subject'}
                      </p>

                      <p className="mb-2 line-clamp-1 text-xs text-gray-600">
                        {conv.last_message?.content_text ?? ''}
                      </p>

                      <div className="flex flex-wrap items-center gap-2">
                        {conv.channel && (
                          <ChannelIconBadge
                            channelType={conv.channel.channel_type}
                          />
                        )}

                        {conv.last_message?.ai_classification && (
                          <Badge className="bg-purple-100 text-xs text-purple-700">
                            AI
                          </Badge>
                        )}

                        {isUnread && (
                          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                        )}

                        {conv.assigned_agent && (
                          <Avatar className="h-5 w-5">
                            {conv.assigned_agent.avatar_url ? (
                              <AvatarImage
                                src={conv.assigned_agent.avatar_url}
                                alt={conv.assigned_agent.name}
                              />
                            ) : null}
                            <AvatarFallback className="text-[10px]">
                              {getInitials(conv.assigned_agent.name)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── RIGHT PANEL: Message Detail ─── */}
      <div className="flex flex-1 flex-col bg-gray-50">
        {!selectedConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <Inbox className="h-12 w-12" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="border-b border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {selectedConversation.contact?.avatar_url ? (
                      <AvatarImage
                        src={selectedConversation.contact.avatar_url}
                        alt={selectedConversation.contact.name ?? ''}
                      />
                    ) : null}
                    <AvatarFallback className="bg-gray-100">
                      {getInitials(selectedConversation.contact?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedConversation.contact?.name ?? 'Unknown Contact'}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {selectedConversation.contact?.email ??
                          selectedConversation.contact?.phone ??
                          ''}
                      </span>
                      {selectedConversation.channel && (
                        <ChannelIconBadge
                          channelType={
                            selectedConversation.channel.channel_type
                          }
                        />
                      )}
                      <Badge
                        className={`text-xs ${getStatusColor(selectedConversation.status)}`}
                      >
                        {selectedConversation.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <TicketPlus className="h-4 w-4" />
                    Create Ticket
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <UserPlus className="h-4 w-4" />
                    Assign
                  </Button>
                  <Button variant="default" size="sm" className="gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    Resolve
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <AlarmClock className="h-4 w-4" />
                    Snooze
                  </Button>
                </div>
              </div>
            </div>

            {/* AI Summary (if available) */}
            {selectedConversation.ai_summary && (
              <div className="border-b border-gray-200 bg-white p-4">
                <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Bot className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-700">
                      AI Summary
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {selectedConversation.ai_summary}
                  </p>
                </div>
              </div>
            )}

            {/* Messages Thread */}
            <ScrollArea className="flex-1 p-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Clock className="mr-2 h-5 w-5 animate-spin" />
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Reply Composer */}
            <div className="border-t border-gray-200 bg-white p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <textarea
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Type your message..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSendReply();
                      }
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="icon" className="h-10 w-10">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-10"
                    onClick={handleSendReply}
                    disabled={isSending || !replyText.trim()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
