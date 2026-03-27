import { Search, GitBranch, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

const changes = [
  {
    id: "CHG-2045",
    title: "Database server upgrade to v14.5",
    status: "Scheduled",
    priority: "High",
    type: "Standard",
    requestedBy: "John Doe",
    implementer: "Infrastructure Team",
    scheduledDate: "Mar 30, 2026 02:00 AM",
    risk: "Medium",
    impactedServices: 3,
  },
  {
    id: "CHG-2044",
    title: "Deploy new feature: Enhanced reporting dashboard",
    status: "Pending Approval",
    priority: "Medium",
    type: "Normal",
    requestedBy: "Sarah Johnson",
    implementer: "Development Team",
    scheduledDate: "Mar 29, 2026 08:00 PM",
    risk: "Low",
    impactedServices: 1,
  },
  {
    id: "CHG-2043",
    title: "Network firewall rules update for new security policy",
    status: "In Review",
    priority: "High",
    type: "Standard",
    requestedBy: "Mike Chen",
    implementer: "Network Team",
    scheduledDate: "Mar 28, 2026 10:00 PM",
    risk: "High",
    impactedServices: 5,
  },
  {
    id: "CHG-2042",
    title: "Email server maintenance and patch deployment",
    status: "Approved",
    priority: "Medium",
    type: "Standard",
    requestedBy: "Lisa Wang",
    implementer: "Operations Team",
    scheduledDate: "Mar 31, 2026 03:00 AM",
    risk: "Low",
    impactedServices: 2,
  },
  {
    id: "CHG-2041",
    title: "Office 365 tenant configuration changes",
    status: "Implementing",
    priority: "Low",
    type: "Normal",
    requestedBy: "Tom Harris",
    implementer: "Cloud Team",
    scheduledDate: "Mar 27, 2026 06:00 PM",
    risk: "Low",
    impactedServices: 1,
  },
  {
    id: "CHG-2040",
    title: "Security certificate renewal for web applications",
    status: "Completed",
    priority: "High",
    type: "Standard",
    requestedBy: "Emma Davis",
    implementer: "Security Team",
    scheduledDate: "Mar 26, 2026 11:00 PM",
    risk: "Low",
    impactedServices: 4,
  },
];

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    "Pending Approval": "bg-yellow-100 text-yellow-700 border-yellow-200",
    "In Review": "bg-purple-100 text-purple-700 border-purple-200",
    Approved: "bg-green-100 text-green-700 border-green-200",
    Implementing: "bg-orange-100 text-orange-700 border-orange-200",
    Completed: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
};

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    High: "bg-orange-100 text-orange-700 border-orange-200",
    Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Low: "bg-green-100 text-green-700 border-green-200",
  };
  return colors[priority] || "bg-gray-100 text-gray-700";
};

const getRiskColor = (risk: string) => {
  const colors: Record<string, string> = {
    High: "text-red-600",
    Medium: "text-orange-600",
    Low: "text-green-600",
  };
  return colors[risk] || "text-gray-600";
};

export function Changes() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Change Management</h1>
        <p className="text-sm text-gray-500">Plan, approve, and track IT infrastructure changes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Approval</p>
                <p className="text-3xl font-semibold mt-1">2</p>
              </div>
              <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Scheduled</p>
                <p className="text-3xl font-semibold mt-1">3</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Implementing</p>
                <p className="text-3xl font-semibold mt-1">1</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed This Month</p>
                <p className="text-3xl font-semibold mt-1">28</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search changes by ID, title, or implementer..."
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>
        <Button className="ml-4">Request Change</Button>
      </div>

      {/* Changes Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Change ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Implementer</TableHead>
              <TableHead>Scheduled Date</TableHead>
              <TableHead>Impact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((change) => (
              <TableRow key={change.id} className="cursor-pointer hover:bg-gray-50">
                <TableCell>
                  <span className="text-sm font-medium text-indigo-600">{change.id}</span>
                </TableCell>
                <TableCell>
                  <div className="max-w-md">
                    <p className="text-sm text-gray-900 font-medium line-clamp-2">
                      {change.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                        {change.type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        by {change.requestedBy.split(" ")[0]}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getStatusColor(change.status)}`}>
                    {change.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getPriorityColor(change.priority)}`}>
                    {change.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-sm font-medium ${getRiskColor(change.risk)}`}>
                    {change.risk}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-900">{change.implementer}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-900 whitespace-nowrap">
                    {change.scheduledDate}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {change.impactedServices}
                    </span>
                    <span className="text-xs text-gray-500">services</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
