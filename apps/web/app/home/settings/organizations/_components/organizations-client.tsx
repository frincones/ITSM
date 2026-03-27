'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Building2,
  Users,
  Ticket,
  Globe,
  Mail,
  Phone,
  Calendar,
  Settings,
  UserMinus,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
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
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
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
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  sla_id: string | null;
  max_users: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string;
  user_count: number;
  ticket_count: number;
  [key: string]: unknown;
}

interface OrganizationsClientProps {
  organizations: Organization[];
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

const getIndustryBadge = (industry: string | null) => {
  switch (industry?.toLowerCase()) {
    case 'technology':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'finance':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'healthcare':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'retail':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'manufacturing':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

const DEMO_ORGANIZATIONS: Organization[] = [
  {
    id: 'demo-org-1',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    domain: 'acme-corp.com',
    logo_url: null,
    industry: 'Technology',
    contact_name: 'John Smith',
    contact_email: 'john@acme-corp.com',
    contact_phone: '+1 555-0101',
    is_active: true,
    sla_id: null,
    max_users: 50,
    contract_start: '2025-01-01',
    contract_end: '2026-12-31',
    created_at: '2025-01-01',
    user_count: 32,
    ticket_count: 187,
  },
  {
    id: 'demo-org-2',
    name: 'Global Finance Ltd',
    slug: 'global-finance',
    domain: 'globalfinance.com',
    logo_url: null,
    industry: 'Finance',
    contact_name: 'Maria Garcia',
    contact_email: 'maria@globalfinance.com',
    contact_phone: '+1 555-0202',
    is_active: true,
    sla_id: null,
    max_users: 25,
    contract_start: '2025-03-15',
    contract_end: '2026-03-14',
    created_at: '2025-03-15',
    user_count: 18,
    ticket_count: 94,
  },
  {
    id: 'demo-org-3',
    name: 'HealthFirst Medical',
    slug: 'healthfirst',
    domain: 'healthfirst.org',
    logo_url: null,
    industry: 'Healthcare',
    contact_name: 'Dr. Sarah Lee',
    contact_email: 'slee@healthfirst.org',
    contact_phone: '+1 555-0303',
    is_active: true,
    sla_id: null,
    max_users: 100,
    contract_start: '2025-06-01',
    contract_end: '2027-05-31',
    created_at: '2025-06-01',
    user_count: 67,
    ticket_count: 312,
  },
  {
    id: 'demo-org-4',
    name: 'RetailMax Inc',
    slug: 'retailmax',
    domain: 'retailmax.com',
    logo_url: null,
    industry: 'Retail',
    contact_name: 'Tom Wilson',
    contact_email: 'twilson@retailmax.com',
    contact_phone: null,
    is_active: false,
    sla_id: null,
    max_users: 15,
    contract_start: '2024-09-01',
    contract_end: '2025-08-31',
    created_at: '2024-09-01',
    user_count: 8,
    ticket_count: 41,
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function OrganizationsClient({
  organizations: serverOrganizations,
  slaConfigs,
  tenantId,
}: OrganizationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDomain, setFormDomain] = useState('');
  const [formIndustry, setFormIndustry] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formContractStart, setFormContractStart] = useState('');
  const [formContractEnd, setFormContractEnd] = useState('');
  const [formMaxUsers, setFormMaxUsers] = useState('10');

  const organizations =
    serverOrganizations.length > 0 ? serverOrganizations : DEMO_ORGANIZATIONS;

  const filteredOrgs = searchTerm
    ? organizations.filter(
        (o) =>
          o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.industry ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.contact_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : organizations;

  const resetForm = () => {
    setFormName('');
    setFormSlug('');
    setFormDomain('');
    setFormIndustry('');
    setFormContactName('');
    setFormContactEmail('');
    setFormContactPhone('');
    setFormContractStart('');
    setFormContractEnd('');
    setFormMaxUsers('10');
  };

  const handleNameChange = (value: string) => {
    setFormName(value);
    setFormSlug(slugify(value));
  };

  const handleAddOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    await supabase.from('organizations').insert({
      tenant_id: tenantId,
      name: formName,
      slug: formSlug,
      domain: formDomain || null,
      industry: formIndustry || null,
      contact_name: formContactName || null,
      contact_email: formContactEmail || null,
      contact_phone: formContactPhone || null,
      contract_start: formContractStart || null,
      contract_end: formContractEnd || null,
      max_users: parseInt(formMaxUsers, 10) || 10,
      is_active: true,
    });
    resetForm();
    setAddOpen(false);
    startTransition(() => router.refresh());
  };

  const handleDeactivate = async (orgId: string, currentlyActive: boolean) => {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from('organizations')
      .update({ is_active: !currentlyActive })
      .eq('id', orgId);
    startTransition(() => router.refresh());
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/home/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Organizations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage client organizations, their users, and portal access
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Client Organization</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleAddOrganization}>
                <div>
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    placeholder="Company name"
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-slug">Slug</Label>
                    <Input
                      id="org-slug"
                      placeholder="company-name"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      required
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formSlug || 'slug'}.tdx-itsm.com
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="org-domain">Domain</Label>
                    <Input
                      id="org-domain"
                      placeholder="company.com"
                      value={formDomain}
                      onChange={(e) => setFormDomain(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="org-industry">Industry</Label>
                  <Select value={formIndustry} onValueChange={setFormIndustry}>
                    <SelectTrigger id="org-industry">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-contact-name">Contact Name</Label>
                    <Input
                      id="org-contact-name"
                      placeholder="Jane Doe"
                      value={formContactName}
                      onChange={(e) => setFormContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="org-contact-email">Contact Email</Label>
                    <Input
                      id="org-contact-email"
                      type="email"
                      placeholder="jane@company.com"
                      value={formContactEmail}
                      onChange={(e) => setFormContactEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="org-contact-phone">Contact Phone</Label>
                  <Input
                    id="org-contact-phone"
                    placeholder="+1 555-0000"
                    value={formContactPhone}
                    onChange={(e) => setFormContactPhone(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-contract-start">Contract Start</Label>
                    <Input
                      id="org-contract-start"
                      type="date"
                      value={formContractStart}
                      onChange={(e) => setFormContractStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="org-contract-end">Contract End</Label>
                    <Input
                      id="org-contract-end"
                      type="date"
                      value={formContractEnd}
                      onChange={(e) => setFormContractEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="org-max-users">Max Users</Label>
                  <Input
                    id="org-max-users"
                    type="number"
                    min={1}
                    value={formMaxUsers}
                    onChange={(e) => setFormMaxUsers(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      resetForm();
                      setAddOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending || !formName || !formSlug}>
                    Add Client
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Stats summary */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-semibold">{organizations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-semibold">
                  {organizations.reduce((sum, o) => sum + o.user_count, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Ticket className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Tickets</p>
                <p className="text-2xl font-semibold">
                  {organizations.reduce((sum, o) => sum + o.ticket_count, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization cards */}
      {filteredOrgs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">No organizations found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredOrgs.map((org) => {
            const sla = slaConfigs.find((s) => s.id === org.sla_id);

            return (
              <Card
                key={org.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="p-6">
                  {/* Top row: logo + name + industry + status */}
                  <div className="mb-4 flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {org.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{org.name}</h3>
                        <Badge
                          className={
                            org.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }
                        >
                          {org.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {org.industry && (
                        <Badge
                          className={`mt-1 ${getIndustryBadge(org.industry)}`}
                        >
                          {org.industry}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Portal URL */}
                  <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{org.slug}.tdx-itsm.com</span>
                  </div>

                  {/* Contact */}
                  {(org.contact_name || org.contact_email) && (
                    <div className="mb-3 space-y-1">
                      {org.contact_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{org.contact_name}</span>
                        </div>
                      )}
                      {org.contact_email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{org.contact_email}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SLA */}
                  {sla && (
                    <div className="mb-3">
                      <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        SLA: {sla.name}
                      </Badge>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span>{org.user_count} users</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Ticket className="h-3.5 w-3.5" />
                      <span>{org.ticket_count} tickets</span>
                    </div>
                  </div>

                  {/* Contract dates */}
                  {(org.contract_start || org.contract_end) && (
                    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {formatDate(org.contract_start)} — {formatDate(org.contract_end)}
                      </span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Link href={`/home/settings/organizations/${org.id}`}>
                      <Button variant="outline" size="sm">
                        <Settings className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/home/settings/organizations/${org.id}?tab=users`}>
                      <Button variant="outline" size="sm">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        Users
                      </Button>
                    </Link>
                    <Link href={`/home/settings/organizations/${org.id}?tab=portal`}>
                      <Button variant="outline" size="sm">
                        <Globe className="mr-1 h-3.5 w-3.5" />
                        Portal Config
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className={
                        org.is_active
                          ? 'text-red-600 hover:text-red-700'
                          : 'text-green-600 hover:text-green-700'
                      }
                      onClick={() => handleDeactivate(org.id, org.is_active)}
                      disabled={isPending}
                    >
                      <UserMinus className="mr-1 h-3.5 w-3.5" />
                      {org.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
