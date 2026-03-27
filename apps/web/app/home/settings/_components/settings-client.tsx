'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings as SettingsIcon,
  Users,
  Shield,
  Bell,
  Zap,
  Webhook,
  Calendar,
  Tag,
  Briefcase,
  Bot,
  Clock,
  UserCog,
  Globe,
  Hash,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown> | null;
}

interface AgentRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
}

interface SLAConfigRow {
  id: string;
  name: string;
  first_response_minutes: number | null;
  resolution_minutes: number | null;
  is_active: boolean;
}

interface ProfileRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface SettingsClientProps {
  activeSection: string;
  tenantSettings: TenantSettings | null;
  agents: AgentRow[];
  groups: GroupRow[];
  categories: CategoryRow[];
  slaConfigs: SLAConfigRow[];
  profiles: ProfileRow[];
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

const adminMenu = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'users', label: 'Users & Agents', icon: Users },
  { id: 'groups', label: 'Groups & Teams', icon: UserCog },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'sla', label: 'SLA / OLA', icon: Clock },
  { id: 'calendars', label: 'Business Hours', icon: Calendar },
  { id: 'ai', label: 'AI Configuration', icon: Bot },
  { id: 'partners', label: 'Partners & Vendors', icon: Briefcase },
  { id: 'notifications', label: 'Notification Templates', icon: Bell },
  { id: 'webhooks', label: 'Webhooks & API', icon: Webhook },
  { id: 'integrations', label: 'Integrations', icon: Zap },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '--';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SettingsClient({
  activeSection: initialSection,
  tenantSettings,
  agents,
  groups,
  categories,
  slaConfigs,
  profiles,
}: SettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState(initialSection);

  // General form state
  const [companyName, setCompanyName] = useState(
    tenantSettings?.name ?? '',
  );
  const [ticketPrefix, setTicketPrefix] = useState(
    (tenantSettings?.settings as Record<string, string> | null)?.ticket_prefix ?? 'TKT',
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === 'general') {
        params.delete('section');
      } else {
        params.set('section', tabId);
      }
      startTransition(() => {
        router.push(`/home/settings?${params.toString()}`);
      });
    },
    [router, searchParams],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          Settings & Administration
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your service desk configuration, users, and integrations
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left Sidebar Menu */}
          <div className="col-span-3">
            <Card>
              <CardContent className="p-4">
                <nav className="space-y-1">
                  {adminMenu.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        activeTab === item.id
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Right Content Area */}
          <div className="col-span-9 space-y-6">
            {/* General Settings */}
            {activeTab === 'general' && (
              <Card>
                <CardHeader>
                  <CardTitle>General Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="company">Company Name</Label>
                      <Input
                        id="company"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select defaultValue="utc-5">
                        <SelectTrigger id="timezone" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc-5">
                            UTC-5 (America/Bogota)
                          </SelectItem>
                          <SelectItem value="utc-6">
                            UTC-6 (America/Mexico_City)
                          </SelectItem>
                          <SelectItem value="utc">UTC (London)</SelectItem>
                          <SelectItem value="utc+1">
                            UTC+1 (Europe/Madrid)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="language">Default Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger id="language" className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Espanol</SelectItem>
                          <SelectItem value="pt">Portugues</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="prefix">Ticket Prefix</Label>
                      <Input
                        id="prefix"
                        value={ticketPrefix}
                        onChange={(e) => setTicketPrefix(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Auto-assign Tickets
                        </p>
                        <p className="text-xs text-gray-500">
                          Automatically assign new tickets to agents
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Require Category
                        </p>
                        <p className="text-xs text-gray-500">
                          Make category selection mandatory
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Enable Customer Portal
                        </p>
                        <p className="text-xs text-gray-500">
                          Allow customers to create and track tickets
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Button>Save Changes</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Users & Agents */}
            {activeTab === 'users' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Users & Agents</CardTitle>
                    <Button size="sm">
                      <Users className="mr-2 h-4 w-4" />
                      Add Agent
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agents.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No agents found.
                      </p>
                    ) : (
                      agents.map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                        >
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">
                                {agent.name}
                              </h4>
                              <Badge
                                className={
                                  agent.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }
                              >
                                {agent.status}
                              </Badge>
                              <Badge className="bg-indigo-100 text-indigo-700">
                                {agent.role}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">
                              {agent.email}
                            </p>
                          </div>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Groups & Teams */}
            {activeTab === 'groups' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Groups & Teams</CardTitle>
                    <Button size="sm">
                      <UserCog className="mr-2 h-4 w-4" />
                      Create Group
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {groups.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No groups found.
                      </p>
                    ) : (
                      groups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                        >
                          <div>
                            <h4 className="mb-1 font-medium text-gray-900">
                              {group.name}
                            </h4>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              {group.description && (
                                <span>{group.description}</span>
                              )}
                              {group.email && (
                                <>
                                  <span>|</span>
                                  <span>{group.email}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Roles & Permissions */}
            {activeTab === 'roles' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Roles & Permissions</CardTitle>
                    <Button size="sm">
                      <Shield className="mr-2 h-4 w-4" />
                      Create Role
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {profiles.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No roles found.
                      </p>
                    ) : (
                      profiles.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                        >
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">
                                {profile.name}
                              </h4>
                              {profile.is_system && (
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                >
                                  System Role
                                </Badge>
                              )}
                            </div>
                            {profile.description && (
                              <p className="text-sm text-gray-600">
                                {profile.description}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={profile.is_system}
                          >
                            Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Categories */}
            {activeTab === 'categories' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Categories & Services</CardTitle>
                    <Button size="sm">
                      <Tag className="mr-2 h-4 w-4" />
                      Add Category
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categories.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No categories found.
                      </p>
                    ) : (
                      categories.map((category) => (
                        <div
                          key={category.id}
                          className={`flex items-center justify-between rounded-lg border border-gray-200 p-4 ${
                            category.parent_id ? 'ml-8' : ''
                          }`}
                        >
                          <div>
                            <h4 className="mb-1 font-medium text-gray-900">
                              {category.name}
                            </h4>
                            {category.description && (
                              <p className="text-sm text-gray-600">
                                {category.description}
                              </p>
                            )}
                          </div>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SLA / OLA */}
            {activeTab === 'sla' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>SLA / OLA Configuration</CardTitle>
                    <Button size="sm">
                      <Clock className="mr-2 h-4 w-4" />
                      Create SLA
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {slaConfigs.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No SLA policies found.
                      </p>
                    ) : (
                      slaConfigs.map((sla) => (
                        <div
                          key={sla.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                        >
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">
                                {sla.name}
                              </h4>
                              <Badge
                                className={
                                  sla.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }
                              >
                                {sla.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span>
                                First Response:{' '}
                                {formatMinutes(
                                  sla.first_response_minutes,
                                )}
                              </span>
                              <span>|</span>
                              <span>
                                Resolution:{' '}
                                {formatMinutes(sla.resolution_minutes)}
                              </span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Business Hours / Calendars */}
            {activeTab === 'calendars' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Business Hours & Calendars</CardTitle>
                    <Button size="sm">
                      <Calendar className="mr-2 h-4 w-4" />
                      Create Calendar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="py-8 text-center text-gray-500">
                    Configure business hours and holiday calendars for SLA
                    calculations.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* AI Configuration */}
            {activeTab === 'ai' && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">AI Auto-Triage</p>
                        <p className="text-xs text-gray-500">
                          Automatically classify and categorize tickets
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          AI Auto-Response
                        </p>
                        <p className="text-xs text-gray-500">
                          Allow AI to respond to simple queries
                        </p>
                      </div>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Portal AI Assistant
                        </p>
                        <p className="text-xs text-gray-500">
                          Enable AI assistant in customer portal
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label htmlFor="model">AI Model</Label>
                    <Select defaultValue="claude-sonnet">
                      <SelectTrigger id="model" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet">
                          Claude Sonnet 4
                        </SelectItem>
                        <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
                        <SelectItem value="gemini">Gemini Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="confidence">
                      Confidence Threshold (%)
                    </Label>
                    <Input
                      id="confidence"
                      type="number"
                      defaultValue="80"
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Minimum confidence level for automatic actions
                    </p>
                  </div>
                  <Button>Save AI Configuration</Button>
                </CardContent>
              </Card>
            )}

            {/* Partners & Vendors */}
            {activeTab === 'partners' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Partners & Vendors</CardTitle>
                    <Button size="sm">
                      <Briefcase className="mr-2 h-4 w-4" />
                      Add Partner
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="py-8 text-center text-gray-500">
                    Manage external partners and vendor integrations.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Notification Templates */}
            {activeTab === 'notifications' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Notification Templates</CardTitle>
                    <Button size="sm">
                      <Bell className="mr-2 h-4 w-4" />
                      Create Template
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="py-8 text-center text-gray-500">
                    Configure email and in-app notification templates.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Webhooks & API */}
            {activeTab === 'webhooks' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Webhooks & API</CardTitle>
                    <Button size="sm">
                      <Webhook className="mr-2 h-4 w-4" />
                      Create Webhook
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="py-8 text-center text-gray-500">
                    Manage webhook endpoints and API keys.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Integrations */}
            {activeTab === 'integrations' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Integrations</CardTitle>
                    <Button size="sm">
                      <Zap className="mr-2 h-4 w-4" />
                      Add Integration
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="py-8 text-center text-gray-500">
                    Connect with external services like Office 365, GitHub,
                    Slack, and more.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
