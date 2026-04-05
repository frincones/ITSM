'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Plus,
  Save,
  Copy,
  Check,
  Trash2,
  Globe,
  Users,
  Shield,
  Palette,
  Settings,
  ExternalLink,
  UserPlus,
  Eye,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Textarea } from '@kit/ui/textarea';
import { Switch } from '@kit/ui/switch';
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  brand_colors: { primary?: string; secondary?: string } | null;
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
  sla_id: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  max_users: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  [key: string]: unknown;
}

interface AssignedAgent {
  pivot_id: string;
  agent_id: string;
  name: string;
  email: string;
  access_level: string;
}

interface OrgDetailClientProps {
  organization: Organization;
  orgUsers: OrgUser[];
  assignedAgents: AssignedAgent[];
  allAgents: Array<{ id: string; name: string; email: string }>;
  slaConfigs: Array<{ id: string; name: string }>;
  tenantId: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const INDUSTRIES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Retail',
  'Manufacturing',
  'Other',
] as const;

const ACCESS_LEVELS = [
  { value: 'full', label: 'Full Access' },
  { value: 'tickets_only', label: 'Tickets Only' },
  { value: 'readonly', label: 'Read Only' },
  { value: 'portal_admin', label: 'Portal Admin' },
] as const;

const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'user', label: 'User' },
  { value: 'readonly', label: 'Read Only' },
] as const;

const getRoleBadge = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'manager':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'user':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'readonly':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  }
};

const getAccessBadge = (level: string) => {
  switch (level) {
    case 'full':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'tickets_only':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'readonly':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    case 'portal_admin':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-500';
  }
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function OrgDetailClient({
  organization,
  orgUsers,
  assignedAgents,
  allAgents,
  slaConfigs,
  tenantId,
}: OrgDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaultTab = searchParams.get('tab') ?? 'general';

  // -- General tab state --
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [domain, setDomain] = useState(organization.domain ?? '');
  const [industry, setIndustry] = useState(organization.industry ?? '');
  const [contactName, setContactName] = useState(organization.contact_name ?? '');
  const [contactEmail, setContactEmail] = useState(organization.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(organization.contact_phone ?? '');
  const [address, setAddress] = useState(organization.address ?? '');
  const [notes, setNotes] = useState(organization.notes ?? '');
  const [contractStart, setContractStart] = useState(organization.contract_start ?? '');
  const [contractEnd, setContractEnd] = useState(organization.contract_end ?? '');
  const [slaId, setSlaId] = useState(organization.sla_id ?? '');

  // -- Branding tab state --
  const [primaryColor, setPrimaryColor] = useState(
    organization.brand_colors?.primary ?? '#4f46e5',
  );
  const [secondaryColor, setSecondaryColor] = useState(
    organization.brand_colors?.secondary ?? '#7c3aed',
  );

  // -- AI Context tab state --
  const [aiContext, setAiContext] = useState(
    (organization as Record<string, unknown>).ai_context as string ?? '',
  );
  const [aiContextSaved, setAiContextSaved] = useState(false);

  // -- Portal tab state --
  const [portalEnabled, setPortalEnabled] = useState(organization.is_active);
  const [copied, setCopied] = useState(false);

  // -- Invite user dialog --
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');

  // -- Assign agent dialog --
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignAccessLevel, setAssignAccessLevel] = useState('full');

  const supabase = getSupabaseBrowserClient();

  /* ---- General tab: save ---- */
  const handleSaveGeneral = async () => {
    await supabase
      .from('organizations')
      .update({
        name,
        slug,
        domain: domain || null,
        industry: industry || null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        address: address || null,
        notes: notes || null,
        contract_start: contractStart || null,
        contract_end: contractEnd || null,
        sla_id: slaId || null,
      })
      .eq('id', organization.id);
    startTransition(() => router.refresh());
  };

  /* ---- Branding tab: save ---- */
  const handleSaveBranding = async () => {
    await supabase
      .from('organizations')
      .update({
        brand_colors: { primary: primaryColor, secondary: secondaryColor },
      })
      .eq('id', organization.id);
    startTransition(() => router.refresh());
  };

  /* ---- Users tab ---- */
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('organization_users').insert({
      tenant_id: tenantId,
      organization_id: organization.id,
      name: inviteName,
      email: inviteEmail,
      role: inviteRole,
      is_active: true,
    });
    setInviteName('');
    setInviteEmail('');
    setInviteRole('user');
    setInviteOpen(false);
    startTransition(() => router.refresh());
  };

  const handleToggleUserActive = async (userId: string, currentlyActive: boolean) => {
    await supabase
      .from('organization_users')
      .update({ is_active: !currentlyActive })
      .eq('id', userId);
    startTransition(() => router.refresh());
  };

  const handleChangeUserRole = async (userId: string, newRole: string) => {
    await supabase
      .from('organization_users')
      .update({ role: newRole })
      .eq('id', userId);
    startTransition(() => router.refresh());
  };

  /* ---- Agents tab ---- */
  const handleAssignAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('agent_organizations').insert({
      tenant_id: tenantId,
      agent_id: assignAgentId,
      organization_id: organization.id,
      access_level: assignAccessLevel,
    });
    setAssignAgentId('');
    setAssignAccessLevel('full');
    setAssignOpen(false);
    startTransition(() => router.refresh());
  };

  const handleRemoveAgent = async (pivotId: string) => {
    await supabase.from('agent_organizations').delete().eq('id', pivotId);
    startTransition(() => router.refresh());
  };

  /* ---- AI Context tab: save ---- */
  const handleSaveAiContext = async () => {
    await supabase
      .from('organizations')
      .update({ ai_context: aiContext || null })
      .eq('id', organization.id);
    setAiContextSaved(true);
    setTimeout(() => setAiContextSaved(false), 2000);
    startTransition(() => router.refresh());
  };

  /* ---- Portal tab ---- */
  const portalToken = (organization as Record<string, unknown>).portal_token as string ?? '';
  const portalUrl = portalToken
    ? `${window.location.origin}/portal/${portalToken}`
    : `https://${organization.slug}.tdx-itsm.com`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    const newToken = crypto.randomUUID();
    await supabase
      .from('organizations')
      .update({ portal_token: newToken })
      .eq('id', organization.id);
    startTransition(() => router.refresh());
  };

  const handleTogglePortal = async (enabled: boolean) => {
    setPortalEnabled(enabled);
    await supabase
      .from('organizations')
      .update({ is_active: enabled })
      .eq('id', organization.id);
    startTransition(() => router.refresh());
  };

  // Filter out already-assigned agents from the dropdown
  const availableAgents = allAgents.filter(
    (a) => !assignedAgents.some((aa) => aa.agent_id === a.id),
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/home/settings/organizations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-muted-foreground">
            {organization.slug}.tdx-itsm.com
          </p>
        </div>
        <Badge
          className={
            organization.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }
        >
          {organization.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">
            <Settings className="mr-1.5 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-1.5 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Shield className="mr-1.5 h-4 w-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="mr-1.5 h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="portal">
            <Globe className="mr-1.5 h-4 w-4" />
            Portal
          </TabsTrigger>
          <TabsTrigger value="ai-context">
            <Bot className="mr-1.5 h-4 w-4" />
            AI Context
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/*  TAB: General                                                   */}
        {/* ============================================================== */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="gen-name">Name</Label>
                  <Input
                    id="gen-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gen-slug">Slug</Label>
                  <Input
                    id="gen-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {slug}.tdx-itsm.com
                  </p>
                </div>
                <div>
                  <Label htmlFor="gen-domain">Domain</Label>
                  <Input
                    id="gen-domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="company.com"
                  />
                </div>
                <div>
                  <Label htmlFor="gen-industry">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger id="gen-industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="gen-contact-name">Contact Name</Label>
                  <Input
                    id="gen-contact-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gen-contact-email">Contact Email</Label>
                  <Input
                    id="gen-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gen-contact-phone">Contact Phone</Label>
                  <Input
                    id="gen-contact-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="gen-address">Address</Label>
                <Input
                  id="gen-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="gen-notes">Notes</Label>
                <Textarea
                  id="gen-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="gen-contract-start">Contract Start</Label>
                  <Input
                    id="gen-contract-start"
                    type="date"
                    value={contractStart}
                    onChange={(e) => setContractStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gen-contract-end">Contract End</Label>
                  <Input
                    id="gen-contract-end"
                    type="date"
                    value={contractEnd}
                    onChange={(e) => setContractEnd(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gen-sla">SLA Policy</Label>
                  <Select value={slaId} onValueChange={setSlaId}>
                    <SelectTrigger id="gen-sla">
                      <SelectValue placeholder="No SLA assigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {slaConfigs.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button onClick={handleSaveGeneral} disabled={isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/*  TAB: Users                                                     */}
        {/* ============================================================== */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Organization Users</CardTitle>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invite User</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleInviteUser}>
                      <div>
                        <Label htmlFor="invite-name">Name</Label>
                        <Input
                          id="invite-name"
                          placeholder="Full name"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="user@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="invite-role">Role</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger id="invite-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {USER_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setInviteOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isPending || !inviteName || !inviteEmail}>
                          Invite
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {orgUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No users yet</p>
                  <p className="text-sm text-muted-foreground">
                    Invite users to give them portal access
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(val) => handleChangeUserRole(u.id, val)}
                          >
                            <SelectTrigger className="h-8 w-28">
                              <Badge className={getRoleBadge(u.role)}>
                                {u.role}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {USER_ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              u.is_active
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }
                          >
                            {u.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(u.last_login_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleUserActive(u.id, u.is_active)}
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/*  TAB: Agents                                                    */}
        {/* ============================================================== */}
        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Assigned Agents</CardTitle>
                <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Assign Agent
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Assign Agent</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleAssignAgent}>
                      <div>
                        <Label htmlFor="assign-agent">Agent</Label>
                        <Select value={assignAgentId} onValueChange={setAssignAgentId}>
                          <SelectTrigger id="assign-agent">
                            <SelectValue placeholder="Select agent" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableAgents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="assign-access">Access Level</Label>
                        <Select
                          value={assignAccessLevel}
                          onValueChange={setAssignAccessLevel}
                        >
                          <SelectTrigger id="assign-access">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCESS_LEVELS.map((al) => (
                              <SelectItem key={al.value} value={al.value}>
                                {al.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setAssignOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isPending || !assignAgentId}
                        >
                          Assign
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {assignedAgents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Shield className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No agents assigned</p>
                  <p className="text-sm text-muted-foreground">
                    Assign agents to manage this organization's tickets
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedAgents.map((aa) => (
                      <TableRow key={aa.pivot_id}>
                        <TableCell className="font-medium">{aa.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {aa.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={getAccessBadge(aa.access_level)}>
                            {ACCESS_LEVELS.find((al) => al.value === aa.access_level)
                              ?.label ?? aa.access_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleRemoveAgent(aa.pivot_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/*  TAB: Branding                                                  */}
        {/* ============================================================== */}
        <TabsContent value="branding">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Brand Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo upload placeholder */}
                <div>
                  <Label>Logo</Label>
                  <div className="mt-2 flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
                    <div className="text-center">
                      <Eye className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="mt-1 text-xs text-muted-foreground">Upload logo</p>
                    </div>
                  </div>
                </div>

                {/* Primary color */}
                <div>
                  <Label htmlFor="brand-primary">Primary Color</Label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      id="brand-primary"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>

                {/* Secondary color */}
                <div>
                  <Label htmlFor="brand-secondary">Secondary Color</Label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      id="brand-secondary"
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t pt-4">
                  <Button onClick={handleSaveBranding} disabled={isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Branding
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Portal Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border">
                  {/* Preview header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-white/20 text-sm font-bold text-white">
                      {organization.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-semibold text-white">
                      {organization.name}
                    </span>
                  </div>
                  {/* Preview body */}
                  <div className="space-y-3 bg-muted/30 p-4">
                    <div className="h-3 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <Button
                      size="sm"
                      style={{ backgroundColor: secondaryColor, color: '#fff' }}
                    >
                      Submit Ticket
                    </Button>
                    <div className="mt-3 space-y-2">
                      <div className="h-10 rounded bg-muted" />
                      <div className="h-10 rounded bg-muted" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/*  TAB: Portal                                                    */}
        {/* ============================================================== */}
        <TabsContent value="portal">
          <Card>
            <CardHeader>
              <CardTitle>Portal Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Portal Link Token */}
              <div>
                <Label>Portal Support Link</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Share this link with the client to embed as a &quot;Help&quot; or &quot;Support&quot; button in their application.
                  The link automatically loads the portal with this organization&apos;s branding and AI context.
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs break-all">
                    {portalUrl}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                    {copied ? (
                      <Check className="mr-1 h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="mr-1 h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={handleRegenerateToken}
                    disabled={isPending}
                  >
                    Regenerate token
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Regenerating invalidates the old link
                  </span>
                </div>
              </div>

              {/* Embed instructions */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                <p className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                  How to embed in your client&apos;s app:
                </p>
                <pre className="overflow-x-auto rounded bg-white/60 p-2 text-xs dark:bg-gray-900/60">
{`<a href="${portalUrl}"
   target="_blank"
   rel="noopener">
  Help & Support
</a>`}
                </pre>
              </div>

              {/* Portal enabled toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Portal Enabled</p>
                  <p className="text-sm text-muted-foreground">
                    When disabled, users cannot access the client portal
                  </p>
                </div>
                <Switch
                  checked={portalEnabled}
                  onCheckedChange={handleTogglePortal}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                        <Eye className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Visits
                        </p>
                        <p className="text-2xl font-semibold">--</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                        <Globe className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Tickets via Portal
                        </p>
                        <p className="text-2xl font-semibold">--</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/*  TAB: AI Context                                                */}
        {/* ============================================================== */}
        <TabsContent value="ai-context">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Support Context
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                This text is injected into the AI assistant's prompt when it responds
                to tickets and chats from this organization. The more context you
                provide, the more accurately the AI can classify and resolve issues.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ai-context-input">Application Context</Label>
                <Textarea
                  id="ai-context-input"
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={20}
                  className="mt-1 font-mono text-sm"
                  placeholder={`## Description of the Application
E.g.: Web-based inventory management system for pharmacies. Stack: React + Node.js + PostgreSQL.

## Main Features
- Product registration with barcode scanning
- Stock control with minimum alerts
- Daily/weekly/monthly sales reports
- Electronic invoicing integrated with tax authority

## User Flows
1. Receive goods: Scan → Validate → Register → Update stock
2. Sale: Search product → Add to cart → Invoice → Update stock
3. Report: Select period → Filter by category → Export PDF/Excel

## Known Issues
- PDF export fails with more than 10,000 records (workaround: export as Excel)
- USB barcode reader requires specific driver on Windows 11

## Classification Rules
- Error in electronic invoicing → incident (critical)
- "Can't scan" + USB reader → support (check driver installation)
- "I want a report for X" where X doesn't exist → backlog
- Damaged equipment within 1 year of purchase → warranty`}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {aiContext.length.toLocaleString()} / 100,000 characters
                </p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Tip:</strong> Include the app description, main user stories,
                  common user flows, known issues with workarounds, and specific
                  classification rules. The AI uses this to distinguish between support
                  issues (user error), incidents (bugs), warranty claims, and feature
                  requests.
                </p>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button onClick={handleSaveAiContext} disabled={isPending}>
                  {aiContextSaved ? (
                    <Check className="mr-2 h-4 w-4 text-green-600" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {aiContextSaved ? 'Saved!' : 'Save AI Context'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
