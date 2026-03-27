import { Search, Laptop, Monitor, Smartphone, Server, HardDrive, Router } from "lucide-react";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Avatar, AvatarFallback } from "../components/ui/avatar";

const assets = [
  {
    id: "LAPTOP-001",
    name: "MacBook Pro 16\" M3",
    type: "Laptop",
    icon: Laptop,
    assignedTo: "John Doe",
    status: "In Use",
    location: "San Francisco Office",
    serialNumber: "C02XG0FDH7JY",
    purchaseDate: "Jan 15, 2026",
  },
  {
    id: "MONITOR-045",
    name: "Dell UltraSharp 27\" 4K",
    type: "Monitor",
    icon: Monitor,
    assignedTo: "Sarah Johnson",
    status: "In Use",
    location: "New York Office",
    serialNumber: "CN0JG4F2779301AB",
    purchaseDate: "Feb 20, 2026",
  },
  {
    id: "PHONE-123",
    name: "iPhone 15 Pro",
    type: "Mobile",
    icon: Smartphone,
    assignedTo: "Mike Chen",
    status: "In Use",
    location: "Remote",
    serialNumber: "F17XN2B4Q1GF",
    purchaseDate: "Mar 10, 2026",
  },
  {
    id: "SERVER-012",
    name: "Dell PowerEdge R750",
    type: "Server",
    icon: Server,
    assignedTo: null,
    status: "Active",
    location: "Data Center A",
    serialNumber: "1234567890AB",
    purchaseDate: "Dec 5, 2025",
  },
  {
    id: "LAPTOP-089",
    name: "ThinkPad X1 Carbon Gen 11",
    type: "Laptop",
    icon: Laptop,
    assignedTo: "Emma Davis",
    status: "In Use",
    location: "Austin Office",
    serialNumber: "PC12345678",
    purchaseDate: "Jan 30, 2026",
  },
  {
    id: "STORAGE-005",
    name: "Synology DS920+",
    type: "Storage",
    icon: HardDrive,
    assignedTo: null,
    status: "Active",
    location: "Data Center B",
    serialNumber: "2040ABC123DEF",
    purchaseDate: "Nov 12, 2025",
  },
  {
    id: "ROUTER-018",
    name: "Cisco Catalyst 9300",
    type: "Network",
    icon: Router,
    assignedTo: null,
    status: "Active",
    location: "Network Room",
    serialNumber: "FCW2234A1B2",
    purchaseDate: "Oct 8, 2025",
  },
];

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    "In Use": "bg-green-100 text-green-700 border-green-200",
    Active: "bg-blue-100 text-blue-700 border-blue-200",
    Maintenance: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Retired: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
};

export function Assets() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Asset Management</h1>
        <p className="text-sm text-gray-500">{assets.length} total assets</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Assets</p>
                <p className="text-3xl font-semibold mt-1">247</p>
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
                <p className="text-3xl font-semibold mt-1">198</p>
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
                <p className="text-3xl font-semibold mt-1">42</p>
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
                <p className="text-3xl font-semibold mt-1">7</p>
              </div>
              <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Server className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search assets by ID, name, or serial number..."
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>
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
            {assets.map((asset) => (
              <TableRow key={asset.id} className="cursor-pointer hover:bg-gray-50">
                <TableCell>
                  <span className="text-sm font-medium text-indigo-600">{asset.id}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <asset.icon className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm text-gray-900">{asset.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className="bg-gray-100 text-gray-700 border-gray-200">
                    {asset.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {asset.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          {asset.assignedTo.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-900">{asset.assignedTo}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getStatusColor(asset.status)}`}>
                    {asset.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-900">{asset.location}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{asset.purchaseDate}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
