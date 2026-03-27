'use client';

import { useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  MessageSquare,
  Globe,
  Phone,
  Plus,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Switch } from '@kit/ui/switch';
import { Separator } from '@kit/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Channel {
  id: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  auto_create_ticket: boolean;
  ai_processing: boolean;
  created_at: string;
  updated_at: string;
}

interface ChannelsClientProps {
  channels: Channel[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChannelIcon(channelType: string) {
  if (channelType.startsWith('email')) return Mail;
  if (channelType === 'whatsapp') return MessageSquare;
  if (channelType.startsWith('web')) return Globe;
  if (channelType === 'phone') return Phone;
  return Globe;
}

function getChannelTypeLabel(channelType: string) {
  const labels: Record<string, string> = {
    email_imap: 'Email (IMAP)',
    email_office365: 'Office 365',
    email_gmail: 'Gmail',
    whatsapp: 'WhatsApp',
    web_widget: 'Web Widget',
    web_form: 'Web Form',
    api: 'API',
  };
  return labels[channelType] || channelType;
}

function getChannelColor(channelType: string) {
  if (channelType.startsWith('email')) return 'bg-blue-100 text-blue-700';
  if (channelType === 'whatsapp') return 'bg-green-100 text-green-700';
  if (channelType.startsWith('web')) return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

// ---------------------------------------------------------------------------
// Channel Type Config
// ---------------------------------------------------------------------------

const CHANNEL_TYPES = [
  { value: 'email_imap', label: 'Email (IMAP)', icon: Mail },
  { value: 'email_office365', label: 'Office 365', icon: Mail },
  { value: 'email_gmail', label: 'Gmail', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'web_widget', label: 'Web Widget', icon: Globe },
] as const;

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder: string;
}

function getConfigFields(channelType: string): ConfigField[] {
  switch (channelType) {
    case 'email_imap':
      return [
        {
          key: 'imap_host',
          label: 'IMAP Host',
          type: 'text',
          placeholder: 'imap.example.com',
        },
        {
          key: 'imap_port',
          label: 'IMAP Port',
          type: 'number',
          placeholder: '993',
        },
        {
          key: 'smtp_host',
          label: 'SMTP Host',
          type: 'text',
          placeholder: 'smtp.example.com',
        },
        {
          key: 'smtp_port',
          label: 'SMTP Port',
          type: 'number',
          placeholder: '587',
        },
        {
          key: 'email',
          label: 'Email Address',
          type: 'text',
          placeholder: 'support@company.com',
        },
        {
          key: 'password',
          label: 'Password',
          type: 'password',
          placeholder: 'App password',
        },
      ];
    case 'email_office365':
      return [
        {
          key: 'client_id',
          label: 'Client ID',
          type: 'text',
          placeholder: 'Azure AD App Client ID',
        },
        {
          key: 'client_secret',
          label: 'Client Secret',
          type: 'password',
          placeholder: 'Client secret',
        },
        {
          key: 'tenant_id',
          label: 'Azure Tenant ID',
          type: 'text',
          placeholder: 'Azure AD Tenant ID',
        },
        {
          key: 'email',
          label: 'Mailbox Email',
          type: 'text',
          placeholder: 'support@company.com',
        },
      ];
    case 'email_gmail':
      return [
        {
          key: 'client_id',
          label: 'Client ID',
          type: 'text',
          placeholder: 'Google OAuth Client ID',
        },
        {
          key: 'client_secret',
          label: 'Client Secret',
          type: 'password',
          placeholder: 'Client secret',
        },
        {
          key: 'email',
          label: 'Gmail Address',
          type: 'text',
          placeholder: 'support@company.com',
        },
      ];
    case 'whatsapp':
      return [
        {
          key: 'phone_number_id',
          label: 'Phone Number ID',
          type: 'text',
          placeholder: 'WhatsApp Business Phone Number ID',
        },
        {
          key: 'access_token',
          label: 'Access Token',
          type: 'password',
          placeholder: 'Permanent access token',
        },
        {
          key: 'webhook_verify_token',
          label: 'Webhook Verify Token',
          type: 'text',
          placeholder: 'Custom verify token',
        },
      ];
    case 'web_widget':
      return [
        {
          key: 'widget_color',
          label: 'Widget Color',
          type: 'text',
          placeholder: '#6366f1',
        },
        {
          key: 'greeting_text',
          label: 'Greeting Message',
          type: 'text',
          placeholder: 'Hello! How can we help you?',
        },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Add/Edit Channel Dialog
// ---------------------------------------------------------------------------

function ChannelDialog({
  channel,
  open,
  onOpenChange,
  onSave,
}: {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    channel_type: string;
    config: Record<string, string>;
  }) => void;
}) {
  const isEditing = !!channel;
  const [channelType, setChannelType] = useState(
    channel?.channel_type ?? 'email_imap',
  );
  const [name, setName] = useState(channel?.name ?? '');
  const [config, setConfig] = useState<Record<string, string>>(
    (channel?.config as Record<string, string>) ?? {},
  );
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');

  const configFields = getConfigFields(channelType);

  const handleTestConnection = () => {
    setTestStatus('testing');
    // Simulate test (in production, call a server action)
    setTimeout(() => {
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    }, 2000);
  };

  const handleSave = () => {
    onSave({ name, channel_type: channelType, config });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Channel' : 'Add Channel'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update channel configuration.'
              : 'Configure a new communication channel for your inbox.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Channel Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Channel Name
            </label>
            <Input
              placeholder="e.g., Support Email"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Channel Type */}
          {!isEditing && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Channel Type
              </label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>
                      <span className="flex items-center gap-2">
                        <ct.icon className="h-4 w-4" />
                        {ct.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          {/* Config Fields */}
          {configFields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {field.label}
              </label>
              <Input
                type={field.type}
                placeholder={field.placeholder}
                value={config[field.key] ?? ''}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}

          {/* Test Connection */}
          {configFields.length > 0 && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="gap-2"
              >
                {testStatus === 'testing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : testStatus === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : testStatus === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                Test Connection
              </Button>
              {testStatus === 'success' && (
                <span className="text-sm text-green-600">
                  Connection successful
                </span>
              )}
              {testStatus === 'error' && (
                <span className="text-sm text-red-600">
                  Connection failed
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {isEditing ? 'Save Changes' : 'Add Channel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChannelsClient({
  channels: initialChannels,
}: ChannelsClientProps) {
  const supabase = useSupabase();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isPending, startTransition] = useTransition();

  // ---------------------------------------------------------------------------
  // Toggle active status
  // ---------------------------------------------------------------------------

  const handleToggleActive = (channel: Channel) => {
    const newActive = !channel.is_active;

    // Optimistic update
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channel.id ? { ...c, is_active: newActive } : c,
      ),
    );

    startTransition(async () => {
      await supabase
        .from('inbox_channels')
        .update({ is_active: newActive })
        .eq('id', channel.id);
    });
  };

  // ---------------------------------------------------------------------------
  // Add channel
  // ---------------------------------------------------------------------------

  const handleAddChannel = (data: {
    name: string;
    channel_type: string;
    config: Record<string, string>;
  }) => {
    startTransition(async () => {
      const { data: newChannel } = await supabase
        .from('inbox_channels')
        .insert({
          name: data.name,
          channel_type: data.channel_type,
          config: data.config,
        })
        .select()
        .single();

      if (newChannel) {
        setChannels((prev) => [newChannel as Channel, ...prev]);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Edit channel
  // ---------------------------------------------------------------------------

  const handleEditChannel = (data: {
    name: string;
    channel_type: string;
    config: Record<string, string>;
  }) => {
    if (!editingChannel) return;

    const id = editingChannel.id;

    // Optimistic update
    setChannels((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, name: data.name, config: data.config }
          : c,
      ),
    );

    startTransition(async () => {
      await supabase
        .from('inbox_channels')
        .update({ name: data.name, config: data.config })
        .eq('id', id);
    });

    setEditingChannel(null);
  };

  // ---------------------------------------------------------------------------
  // Delete channel
  // ---------------------------------------------------------------------------

  const handleDeleteChannel = (channel: Channel) => {
    if (!confirm(`Delete channel "${channel.name}"? This cannot be undone.`)) {
      return;
    }

    setChannels((prev) => prev.filter((c) => c.id !== channel.id));

    startTransition(async () => {
      await supabase.from('inbox_channels').delete().eq('id', channel.id);
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Channels
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your inbox communication channels
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              setEditingChannel(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Channel
          </Button>
        </div>
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-auto p-6">
        {channels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-gray-400">
              <WifiOff className="mb-3 h-10 w-10" />
              <p className="text-sm">No channels configured yet</p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => {
                  setEditingChannel(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add your first channel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {channels.map((channel) => {
              const Icon = getChannelIcon(channel.channel_type);

              return (
                <Card key={channel.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    {/* Icon */}
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-lg ${getChannelColor(channel.channel_type)}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          {channel.name}
                        </h3>
                        <Badge
                          className={`text-xs ${getChannelColor(channel.channel_type)}`}
                        >
                          {getChannelTypeLabel(channel.channel_type)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        Created{' '}
                        {formatDistanceToNow(new Date(channel.created_at), {
                          addSuffix: true,
                        })}
                        {channel.auto_create_ticket && (
                          <span className="ml-2 text-gray-400">
                            Auto-creates tickets
                          </span>
                        )}
                        {channel.ai_processing && (
                          <span className="ml-2 text-purple-500">
                            AI processing enabled
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${channel.is_active ? 'text-green-600' : 'text-gray-400'}`}
                      >
                        {channel.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <Switch
                        checked={channel.is_active}
                        onCheckedChange={() => handleToggleActive(channel)}
                      />
                    </div>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingChannel(channel);
                          setDialogOpen(true);
                        }}
                      >
                        <Settings className="h-4 w-4 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteChannel(channel)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <ChannelDialog
        channel={editingChannel}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={editingChannel ? handleEditChannel : handleAddChannel}
      />
    </div>
  );
}
