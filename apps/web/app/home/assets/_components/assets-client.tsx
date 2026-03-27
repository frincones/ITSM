'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Filter,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  Server,
  HardDrive,
  Router,
  Cpu,
  Package,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Asset {
  id: string;
  asset_tag?: string | null;
  name: string;
  type: string | null;
  status: string;
  assigned_to?: string | null;
  location?: string | null;
  serial_number?: string | null;
  purchase_date?: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface AssetsClientProps {
  assets: Asset[];
  totalAssets: number;
  inUseCount: number;
  availableCount: number;
  maintenanceCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    in_use: 'bg-green-100 text-green-700 border-green-200',
    active: 'bg-blue-100 text-blue-700 border-blue-200',
    available: 'bg-purple-100 text-purple-700 border-purple-200',
    maintenance: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    retired: 'bg-gray-100 text-gray-700 border-gray-200',
    disposed: 'bg-red-100 text-red-700 border-red-200',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-700';
};

const getTypeIcon = (type: string | null) => {
  switch (type?.toLowerCase()) {
    case 'laptop':
      return Laptop;
    case 'monitor':
    case 'display':
      return Monitor;
    case 'mobile':
    case 'phone':
    case 'smartphone':
      return Smartphone;
    case 'server':
      return Server;
    case 'storage':
      return HardDrive;
    case 'network':
    case 'router':
    case 'switch':
      return Router;
    case 'desktop':
    case 'workstation':
      return Cpu;
    default:
      return Package;
  }
};

const formatStatusLabel = (status: string) =>
  status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

const DEMO_ASSETS: Asset[] = [
  {
    id: '1',
    asset_tag: 'LAPTOP-001',
    name: 'MacBook Pro 16" M3',
    type: 'Laptop',
    status: 'in_use',
    assigned_to: 'John Doe',
    location: 'San Francisco Office',
    serial_number: 'C02XG0FDH7JY',
    purchase_date: '2026-01-15',
    created_at: '2026-01-15',
  },
  {
    id: '2',
    asset_tag: 'MONITOR-045',
    name: 'Dell UltraSharp 27" 4K',
    type: 'Monitor',
    status: 'in_use',
    assigned_to: 'Sarah Johnson',
    location: 'New York Office',
    serial_number: 'CN0JG4F2779301AB',
    purchase_date: '2026-02-20',
    created_at: '2026-02-20',
  },
  {
    id: '3',
    asset_tag: 'PHONE-123',
    name: 'iPhone 15 Pro',
    type: 'Mobile',
    status: 'in_use',
    assigned_to: 'Mike Chen',
    location: 'Remote',
    serial_number: 'F17XN2B4Q1GF',
    purchase_date: '2026-03-10',
    created_at: '2026-03-10',
  },
  {
    id: '4',
    asset_tag: 'SERVER-012',
    name: 'Dell PowerEdge R750',
    type: 'Server',
    status: 'active',
    assigned_to: null,
    location: 'Data Center A',
    serial_number: '1234567890AB',
    purchase_date: '2025-12-05',
    created_at: '2025-12-05',
  },
  {
    id: '5',
    asset_tag: 'LAPTOP-089',
    name: 'ThinkPad X1 Carbon Gen 11',
    type: 'Laptop',
    status: 'in_use',
    assigned_to: 'Emma Davis',
    location: 'Austin Office',
    serial_number: 'PC12345678',
    purchase_date: '2026-01-30',
    created_at: '2026-01-30',
  },
  {
    id: '6',
    asset_tag: 'STORAGE-005',
    name: 'Synology DS920+',
    type: 'Storage',
    status: 'active',
    assigned_to: null,
    location: 'Data Center B',
    serial_number: '2040ABC123DEF',
    purchase_date: '2025-11-12',
    created_at: '2025-11-12',
  },
  {
    id: '7',
    asset_tag: 'ROUTER-018',
    name: 'Cisco Catalyst 9300',
    type: 'Network',
    status: 'active',
    assigned_to: null,
    location: 'Network Room',
    serial_number: 'FCW2234A1B2',
    purchase_date: '2025-10-08',
    created_at: '2025-10-08',
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AssetsClient({
  assets: serverAssets,
  totalAssets,
  inUseCount,
  availableCount,
  maintenanceCount,
}: AssetsClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);

  const assets = serverAssets.length > 0 ? serverAssets : DEMO_ASSETS;
  const effectiveTotal = serverAssets.length > 0 ? totalAssets : 247;
  const effectiveInUse = serverAssets.length > 0 ? inUseCount : 198;
  const effectiveAvailable = serverAssets.length > 0 ? availableCount : 42;
  const effectiveMaintenance = serverAssets.length > 0 ? maintenanceCount : 7;

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.asset_tag?.toLowerCase().includes(q) ?? false) ||
          (a.serial_number?.toLowerCase().includes(q) ?? false),
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    return result;
  }, [assets, searchTerm, statusFilter]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Asset Management
            </h1>
            <p className="text-sm text-gray-500">
              {effectiveTotal} total assets
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Asset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Asset</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAddOpen(false);
                }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="asset-tag">Asset Tag</Label>
                    <Input id="asset-tag" placeholder="LAPTOP-001" />
                  </div>
                  <div>
                    <Label htmlFor="asset-name">Name</Label>
                    <Input id="asset-name" placeholder="MacBook Pro 16" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="asset-type">Type</Label>
                    <Select>
                      <SelectTrigger id="asset-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="laptop">Laptop</SelectItem>
                        <SelectItem value="monitor">Monitor</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="server">Server</SelectItem>
                        <SelectItem value="storage">Storage</SelectItem>
                        <SelectItem value="network">Network</SelectItem>
                        <SelectItem value="desktop">Desktop</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="asset-serial">Serial Number</Label>
                    <Input id="asset-serial" placeholder="Serial number" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="asset-location">Location</Label>
                    <Input id="asset-location" placeholder="Office / DC" />
                  </div>
                  <div>
                    <Label htmlFor="asset-purchase">Purchase Date</Label>
                    <Input id="asset-purchase" type="date" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Add Asset</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Assets</p>
                <p className="text-3xl font-semibold mt-1">{effectiveTotal}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <HardDrive className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Use</p>
                <p className="text-3xl font-semibold mt-1">{effectiveInUse}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <Laptop className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available</p>
                <p className="text-3xl font-semibold mt-1">
                  {effectiveAvailable}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <Monitor className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Maintenance</p>
                <p className="text-3xl font-semibold mt-1">
                  {effectiveMaintenance}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Server className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search assets by ID, name, or serial number..."
            className="pl-10 bg-gray-50 border-gray-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_use">In Use</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Assets Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Purchase Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No assets found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredAssets.map((asset) => {
                const TypeIcon = getTypeIcon(asset.type);
                return (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <TableCell>
                      <span className="text-sm font-medium text-indigo-600">
                        {asset.asset_tag ?? asset.id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <TypeIcon className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-sm text-gray-900">
                          {asset.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-gray-100 text-gray-700 border-gray-200">
                        {asset.type ?? 'Other'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {asset.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">
                              {asset.assigned_to
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-gray-900">
                            {asset.assigned_to}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs border ${getStatusColor(asset.status)}`}
                      >
                        {formatStatusLabel(asset.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-900">
                        {asset.location ?? '--'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">
                        {formatDate(asset.purchase_date)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
