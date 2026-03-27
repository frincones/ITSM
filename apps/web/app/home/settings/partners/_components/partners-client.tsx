'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Building2,
  Users,
  Shield,
  MoreVertical,
  Mail,
  Phone,
  Globe,
  Handshake,
  Truck,
  Wrench,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Textarea } from '@kit/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
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
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Partner {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  status: string;
  sla_policy_id: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface PartnersClientProps {
  partners: Partner[];
  slaConfigs: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string; email: string }>;
  tenantId: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getTypeBadge = (type: string) => {
  switch (type) {
    case 'provider':
      return { label: 'Provider', className: 'bg-blue-100 text-blue-700', icon: Building2 };
    case 'partner':
      return { label: 'Partner', className: 'bg-green-100 text-green-700', icon: Handshake };
    case 'vendor':
      return { label: 'Vendor', className: 'bg-purple-100 text-purple-700', icon: Truck };
    case 'subcontractor':
      return { label: 'Subcontractor', className: 'bg-orange-100 text-orange-700', icon: Wrench };
    default:
      return { label: type, className: 'bg-gray-100 text-gray-700', icon: Building2 };
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-green-100 text-green-700' };
    case 'inactive':
      return { label: 'Inactive', className: 'bg-gray-100 text-gray-700' };
    case 'suspended':
      return { label: 'Suspended', className: 'bg-red-100 text-red-700' };
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700' };
  }
};

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

const DEMO_PARTNERS: Partner[] = [
  {
    id: 'demo-1',
    name: 'TechCorp Solutions',
    type: 'provider',
    email: 'contact@techcorp.com',
    phone: '+1 555-0100',
    website: 'https://techcorp.com',
    description: 'Cloud infrastructure provider',
    status: 'active',
    sla_policy_id: null,
    created_at: '2025-06-15',
  },
  {
    id: 'demo-2',
    name: 'SecureIT Partners',
    type: 'partner',
    email: 'info@secureit.io',
    phone: '+1 555-0200',
    website: 'https://secureit.io',
    description: 'Security consulting and auditing',
    status: 'active',
    sla_policy_id: null,
    created_at: '2025-08-20',
  },
  {
    id: 'demo-3',
    name: 'NetGear Supplies',
    type: 'vendor',
    email: 'sales@netgear-supplies.com',
    phone: '+1 555-0300',
    website: null,
    description: 'Network equipment supplier',
    status: 'active',
    sla_policy_id: null,
    created_at: '2025-10-01',
  },
  {
    id: 'demo-4',
    name: 'FieldTech Services',
    type: 'subcontractor',
    email: 'dispatch@fieldtech.com',
    phone: '+1 555-0400',
    website: 'https://fieldtech.com',
    description: 'On-site hardware repair and maintenance',
    status: 'inactive',
    sla_policy_id: null,
    created_at: '2025-04-10',
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PartnersClient({
  partners: serverPartners,
  slaConfigs,
  agents,
  tenantId,
}: PartnersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('provider');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSla, setFormSla] = useState('');

  const partners = serverPartners.length > 0 ? serverPartners : DEMO_PARTNERS;

  const filteredPartners = searchTerm
    ? partners.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.type.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : partners;

  const resetForm = () => {
    setFormName('');
    setFormType('provider');
    setFormEmail('');
    setFormPhone('');
    setFormWebsite('');
    setFormDescription('');
    setFormSla('');
  };

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    await supabase.from('partners').insert({
      tenant_id: tenantId,
      name: formName,
      type: formType,
      email: formEmail || null,
      phone: formPhone || null,
      website: formWebsite || null,
      description: formDescription || null,
      sla_policy_id: formSla || null,
      status: 'active',
    });
    resetForm();
    setAddOpen(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/home/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">
              Partners & Vendors
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage external partners, vendors, and subcontractors
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Partner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Partner</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleAddPartner}>
                <div>
                  <Label htmlFor="partner-name">Name</Label>
                  <Input
                    id="partner-name"
                    placeholder="Company name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="partner-type">Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger id="partner-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="subcontractor">
                        Subcontractor
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="partner-email">Email</Label>
                    <Input
                      id="partner-email"
                      type="email"
                      placeholder="contact@company.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="partner-phone">Phone</Label>
                    <Input
                      id="partner-phone"
                      placeholder="+1 555-0000"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="partner-website">Website</Label>
                  <Input
                    id="partner-website"
                    placeholder="https://company.com"
                    value={formWebsite}
                    onChange={(e) => setFormWebsite(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="partner-desc">Description</Label>
                  <Textarea
                    id="partner-desc"
                    placeholder="Describe the partner's services..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                {slaConfigs.length > 0 && (
                  <div>
                    <Label htmlFor="partner-sla">SLA Policy</Label>
                    <Select value={formSla} onValueChange={setFormSla}>
                      <SelectTrigger id="partner-sla">
                        <SelectValue placeholder="Select SLA policy" />
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
                )}
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
                  <Button type="submit" disabled={isPending || !formName}>
                    Add Partner
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search partners..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {(['provider', 'partner', 'vendor', 'subcontractor'] as const).map(
          (type) => {
            const config = getTypeBadge(type);
            const Icon = config.icon;
            const count = partners.filter((p) => p.type === type).length;
            return (
              <Card key={type}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">{config.label}s</p>
                      <p className="text-2xl font-semibold">{count}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          },
        )}
      </div>

      {/* Partners Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPartners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No partners found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredPartners.map((partner) => {
                const typeConfig = getTypeBadge(partner.type);
                const statusConfig = getStatusBadge(partner.status);
                const sla = slaConfigs.find(
                  (s) => s.id === partner.sla_policy_id,
                );

                return (
                  <TableRow
                    key={partner.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedPartner(partner)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">
                          {partner.name}
                        </p>
                        {partner.description && (
                          <p className="text-xs text-gray-500 truncate max-w-[250px]">
                            {partner.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={typeConfig.className}>
                        {typeConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {partner.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Mail className="w-3 h-3" />
                            {partner.email}
                          </div>
                        )}
                        {partner.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Phone className="w-3 h-3" />
                            {partner.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig.className}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sla ? (
                        <Badge className="bg-indigo-50 text-indigo-700">
                          {sla.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Edit Partner</DropdownMenuItem>
                          <DropdownMenuItem>Manage Agents</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Partner Detail Drawer (simplified as a dialog) */}
      {selectedPartner && (
        <Dialog
          open={!!selectedPartner}
          onOpenChange={(open) => !open && setSelectedPartner(null)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedPartner.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getTypeBadge(selectedPartner.type).className}>
                  {getTypeBadge(selectedPartner.type).label}
                </Badge>
                <Badge
                  className={getStatusBadge(selectedPartner.status).className}
                >
                  {getStatusBadge(selectedPartner.status).label}
                </Badge>
              </div>

              {selectedPartner.description && (
                <p className="text-sm text-gray-600">
                  {selectedPartner.description}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 text-sm">
                {selectedPartner.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{selectedPartner.email}</span>
                  </div>
                )}
                {selectedPartner.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{selectedPartner.phone}</span>
                  </div>
                )}
                {selectedPartner.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <a
                      href={selectedPartner.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {selectedPartner.website}
                    </a>
                  </div>
                )}
              </div>

              {/* Partner Agents section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Partner Agents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-500">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-center">
                      No agents assigned to this partner yet
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
