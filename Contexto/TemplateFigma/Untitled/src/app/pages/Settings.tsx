import { useState } from "react";
import {
  Settings as SettingsIcon,
  Users,
  Shield,
  Globe,
  Bell,
  Zap,
  Database,
  Webhook,
  Calendar,
  Tag,
  Briefcase,
  Bot,
  Clock,
  Building,
  UserCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

const adminMenu = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "users", label: "Users & Agents", icon: Users },
  { id: "groups", label: "Groups & Teams", icon: UserCog },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "sla", label: "SLA / OLA", icon: Clock },
  { id: "calendars", label: "Business Hours", icon: Calendar },
  { id: "ai", label: "AI Configuration", icon: Bot },
  { id: "partners", label: "Partners & Vendors", icon: Briefcase },
  { id: "notifications", label: "Notification Templates", icon: Bell },
  { id: "webhooks", label: "Webhooks & API", icon: Webhook },
  { id: "integrations", label: "Integrations", icon: Zap },
];

const agents = [
  { id: 1, name: "John Doe", email: "john@company.com", role: "Admin", status: "active", groups: ["Support", "Network"] },
  { id: 2, name: "Lisa Wang", email: "lisa@company.com", role: "Supervisor", status: "active", groups: ["Support"] },
  { id: 3, name: "Tom Harris", email: "tom@company.com", role: "Agent", status: "active", groups: ["Support", "Hardware"] },
  { id: 4, name: "Sarah Miller", email: "sarah@company.com", role: "Agent", status: "inactive", groups: ["Network"] },
];

const groups = [
  { id: 1, name: "Support Team", agents: 12, manager: "Lisa Wang", email: "support@company.com", sla: "Standard SLA" },
  { id: 2, name: "Network Team", agents: 6, manager: "John Doe", email: "network@company.com", sla: "Critical SLA" },
  { id: 3, name: "Hardware Team", agents: 8, manager: "Tom Harris", email: "hardware@company.com", sla: "Standard SLA" },
];

const roles = [
  { id: 1, name: "Admin", description: "Full system access", users: 3, isSystem: true },
  { id: 2, name: "Supervisor", description: "Manage team and view all tickets", users: 5, isSystem: true },
  { id: 3, name: "Agent", description: "Handle tickets and respond to customers", users: 24, isSystem: true },
  { id: 4, name: "Read-Only", description: "View-only access for reporting", users: 7, isSystem: false },
];

const categories = [
  { id: 1, name: "Network & Connectivity", parent: null, tickets: 234 },
  { id: 2, name: "Hardware", parent: null, tickets: 156 },
  { id: 3, name: "Software", parent: null, tickets: 423 },
  { id: 4, name: "VPN Issues", parent: "Network & Connectivity", tickets: 89 },
  { id: 5, name: "WiFi Problems", parent: "Network & Connectivity", tickets: 145 },
];

const slaConfigs = [
  { id: 1, name: "Critical SLA", firstResponse: "15 min", resolution: "2 hours", compliance: 94 },
  { id: 2, name: "Standard SLA", firstResponse: "1 hour", resolution: "8 hours", compliance: 97 },
  { id: 3, name: "Low Priority SLA", firstResponse: "4 hours", resolution: "24 hours", compliance: 99 },
];

const partners = [
  { id: 1, name: "TechPro Solutions", type: "Provider", agents: 8, status: "active", tickets: 145 },
  { id: 2, name: "DataCenter Inc", type: "Vendor", agents: 3, status: "active", tickets: 67 },
  { id: 3, name: "Cloud Services Ltd", type: "Partner", agents: 5, status: "active", tickets: 234 },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings & Administration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your service desk configuration, users, and integrations
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar Menu */}
        <div className="col-span-3">
          <Card>
            <CardContent className="p-4">
              <nav className="space-y-1">
                {adminMenu.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === item.id
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Right Content Area */}
        <div className="col-span-9 space-y-6">
          {activeTab === "general" && (
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="company">Company Name</Label>
                    <Input id="company" defaultValue="TechCorp Inc" className="mt-2" />
                  </div>
                  <div>
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select defaultValue="utc-5">
                      <SelectTrigger id="timezone" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="utc-5">UTC-5 (America/Bogota)</SelectItem>
                        <SelectItem value="utc-6">UTC-6 (America/Mexico_City)</SelectItem>
                        <SelectItem value="utc">UTC (London)</SelectItem>
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
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="pt">Português</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="prefix">Ticket Prefix</Label>
                    <Input id="prefix" defaultValue="TKT" className="mt-2" />
                  </div>
                </div>
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Auto-assign Tickets</p>
                      <p className="text-xs text-gray-500">Automatically assign new tickets to agents</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Require Category</p>
                      <p className="text-xs text-gray-500">Make category selection mandatory</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Enable Customer Portal</p>
                      <p className="text-xs text-gray-500">Allow customers to create and track tickets</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <Button>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "users" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Users & Agents</CardTitle>
                  <Button size="sm">
                    <Users className="w-4 h-4 mr-2" />
                    Add Agent
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{agent.name}</h4>
                          <Badge className={agent.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                            {agent.status}
                          </Badge>
                          <Badge className="bg-indigo-100 text-indigo-700">{agent.role}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{agent.email}</p>
                        <div className="flex gap-2">
                          {agent.groups.map((group, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {group}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "groups" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Groups & Teams</CardTitle>
                  <Button size="sm">
                    <UserCog className="w-4 h-4 mr-2" />
                    Create Group
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">{group.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{group.agents} agents</span>
                          <span>•</span>
                          <span>Manager: {group.manager}</span>
                          <span>•</span>
                          <span>{group.email}</span>
                          <span>•</span>
                          <span>{group.sla}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "roles" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Roles & Permissions</CardTitle>
                  <Button size="sm">
                    <Shield className="w-4 h-4 mr-2" />
                    Create Role
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {roles.map((role) => (
                    <div key={role.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{role.name}</h4>
                          {role.isSystem && (
                            <Badge variant="outline" className="text-xs">System Role</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{role.description}</p>
                        <span className="text-xs text-gray-500">{role.users} users</span>
                      </div>
                      <Button variant="outline" size="sm" disabled={role.isSystem}>Edit</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "categories" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Categories & Services</CardTitle>
                  <Button size="sm">
                    <Tag className="w-4 h-4 mr-2" />
                    Add Category
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categories.map((category) => (
                    <div key={category.id} className={`flex items-center justify-between p-4 border border-gray-200 rounded-lg ${category.parent ? 'ml-8' : ''}`}>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">{category.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {category.parent && <span>Parent: {category.parent}</span>}
                          <span>{category.tickets} tickets</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "sla" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>SLA / OLA Configuration</CardTitle>
                  <Button size="sm">
                    <Clock className="w-4 h-4 mr-2" />
                    Create SLA
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {slaConfigs.map((sla) => (
                    <div key={sla.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">{sla.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>First Response: {sla.firstResponse}</span>
                          <span>•</span>
                          <span>Resolution: {sla.resolution}</span>
                          <span>•</span>
                          <span className="text-green-600">{sla.compliance}% compliance</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "ai" && (
            <Card>
              <CardHeader>
                <CardTitle>AI Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">AI Auto-Triage</p>
                      <p className="text-xs text-gray-500">Automatically classify and categorize tickets</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">AI Auto-Response</p>
                      <p className="text-xs text-gray-500">Allow AI to respond to simple queries</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Portal AI Assistant</p>
                      <p className="text-xs text-gray-500">Enable AI assistant in customer portal</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <Label htmlFor="model">AI Model</Label>
                  <Select defaultValue="claude-sonnet">
                    <SelectTrigger id="model" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-sonnet">Claude Sonnet 4</SelectItem>
                      <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gemini">Gemini Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="confidence">Confidence Threshold (%)</Label>
                  <Input id="confidence" type="number" defaultValue="80" className="mt-2" />
                  <p className="text-xs text-gray-500 mt-1">Minimum confidence level for automatic actions</p>
                </div>
                <Button>Save AI Configuration</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === "partners" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Partners & Vendors</CardTitle>
                  <Button size="sm">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Add Partner
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {partners.map((partner) => (
                    <div key={partner.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{partner.name}</h4>
                          <Badge className="bg-blue-100 text-blue-700">{partner.type}</Badge>
                          <Badge className="bg-green-100 text-green-700">{partner.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{partner.agents} agents</span>
                          <span>•</span>
                          <span>{partner.tickets} tickets handled</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Manage</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
