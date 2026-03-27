import { Search, AlertTriangle, TrendingUp, Users } from "lucide-react";
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

const problems = [
  {
    id: "PRB-0042",
    title: "Intermittent database connection timeouts affecting multiple services",
    status: "Investigation",
    priority: "High",
    assignedTo: "John Doe",
    category: "Infrastructure",
    relatedIncidents: 12,
    created: "2 days ago",
    impact: "High",
  },
  {
    id: "PRB-0041",
    title: "Email delivery delays during peak hours",
    status: "Root Cause Analysis",
    priority: "Medium",
    assignedTo: "Lisa Wang",
    category: "Email Services",
    relatedIncidents: 8,
    created: "5 days ago",
    impact: "Medium",
  },
  {
    id: "PRB-0040",
    title: "VPN connection drops for remote users in APAC region",
    status: "Known Error",
    priority: "High",
    assignedTo: "Tom Harris",
    category: "Network",
    relatedIncidents: 15,
    created: "1 week ago",
    impact: "High",
  },
  {
    id: "PRB-0039",
    title: "Mobile app crashes on iOS 17.3 devices",
    status: "Resolution",
    priority: "Medium",
    assignedTo: "Sarah Miller",
    category: "Mobile",
    relatedIncidents: 6,
    created: "2 weeks ago",
    impact: "Medium",
  },
  {
    id: "PRB-0038",
    title: "Printing service failures in Building B",
    status: "Resolved",
    priority: "Low",
    assignedTo: "Mike Chen",
    category: "Hardware",
    relatedIncidents: 4,
    created: "3 weeks ago",
    impact: "Low",
  },
];

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Investigation: "bg-blue-100 text-blue-700 border-blue-200",
    "Root Cause Analysis": "bg-purple-100 text-purple-700 border-purple-200",
    "Known Error": "bg-orange-100 text-orange-700 border-orange-200",
    Resolution: "bg-green-100 text-green-700 border-green-200",
    Resolved: "bg-gray-100 text-gray-700 border-gray-200",
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

const getImpactColor = (impact: string) => {
  const colors: Record<string, string> = {
    High: "text-red-600",
    Medium: "text-orange-600",
    Low: "text-green-600",
  };
  return colors[impact] || "text-gray-600";
};

export function Problems() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Problem Management</h1>
        <p className="text-sm text-gray-500">Identify and resolve root causes of recurring incidents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Problems</p>
                <p className="text-3xl font-semibold mt-1">4</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Known Errors</p>
                <p className="text-3xl font-semibold mt-1">1</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Resolved This Month</p>
                <p className="text-3xl font-semibold mt-1">12</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Related Incidents</p>
                <p className="text-3xl font-semibold mt-1">45</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
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
            placeholder="Search problems by ID, title, or category..."
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>
        <Button className="ml-4">Create Problem</Button>
      </div>

      {/* Problems Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Problem ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Related Incidents</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.map((problem) => (
              <TableRow key={problem.id} className="cursor-pointer hover:bg-gray-50">
                <TableCell>
                  <span className="text-sm font-medium text-indigo-600">{problem.id}</span>
                </TableCell>
                <TableCell>
                  <div className="max-w-md">
                    <p className="text-sm text-gray-900 font-medium line-clamp-2">
                      {problem.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{problem.category}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getStatusColor(problem.status)}`}>
                    {problem.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getPriorityColor(problem.priority)}`}>
                    {problem.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-sm font-medium ${getImpactColor(problem.impact)}`}>
                    {problem.impact}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-xs">
                        {problem.assignedTo.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-900">{problem.assignedTo}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {problem.relatedIncidents}
                    </span>
                    <span className="text-xs text-gray-500">incidents</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{problem.created}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
