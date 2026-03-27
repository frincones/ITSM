import { useState } from "react";
import { Link } from "react-router";
import { Filter, Download, MoreVertical, Search as SearchIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Checkbox } from "../components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

const tickets = [
  {
    id: "TKT-1247",
    subject: "Production server down - Database connection failing",
    requester: "Sarah Johnson",
    assignee: "John Doe",
    status: "Open",
    priority: "Critical",
    sla: "15m",
    slaStatus: "breach",
    created: "5 min ago",
    channel: "Email",
  },
  {
    id: "TKT-1246",
    subject: "Cannot access email on mobile device",
    requester: "Mike Chen",
    assignee: "Lisa Wang",
    status: "In Progress",
    priority: "High",
    sla: "2h 45m",
    slaStatus: "ok",
    created: "12 min ago",
    channel: "Portal",
  },
  {
    id: "TKT-1245",
    subject: "Request for new software license - Adobe Creative Cloud",
    requester: "Emma Davis",
    assignee: "Tom Harris",
    status: "Pending",
    priority: "High",
    sla: "4h 20m",
    slaStatus: "ok",
    created: "25 min ago",
    channel: "Portal",
  },
  {
    id: "TKT-1244",
    subject: "VPN connection intermittent issues",
    requester: "Alex Turner",
    assignee: "John Doe",
    status: "In Progress",
    priority: "Medium",
    sla: "6h 15m",
    slaStatus: "ok",
    created: "1 hour ago",
    channel: "Chat",
  },
  {
    id: "TKT-1243",
    subject: "Password reset for multiple accounts",
    requester: "Rachel Green",
    assignee: "Lisa Wang",
    status: "Resolved",
    priority: "Low",
    sla: "Resolved",
    slaStatus: "ok",
    created: "2 hours ago",
    channel: "Email",
  },
  {
    id: "TKT-1242",
    subject: "Laptop keyboard not working properly",
    requester: "James Wilson",
    assignee: null,
    status: "Open",
    priority: "Medium",
    sla: "5h 30m",
    slaStatus: "ok",
    created: "3 hours ago",
    channel: "Portal",
  },
  {
    id: "TKT-1241",
    subject: "Request access to shared drive",
    requester: "Olivia Brown",
    assignee: "Tom Harris",
    status: "Pending",
    priority: "Low",
    sla: "1d 2h",
    slaStatus: "ok",
    created: "5 hours ago",
    channel: "Email",
  },
  {
    id: "TKT-1240",
    subject: "Software installation - Microsoft Teams",
    requester: "David Lee",
    assignee: "John Doe",
    status: "In Progress",
    priority: "Medium",
    sla: "3h 10m",
    slaStatus: "risk",
    created: "6 hours ago",
    channel: "Chat",
  },
];

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    High: "bg-orange-100 text-orange-700 border-orange-200",
    Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Low: "bg-green-100 text-green-700 border-green-200",
  };
  return colors[priority] || "bg-gray-100 text-gray-700";
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Open: "bg-blue-100 text-blue-700 border-blue-200",
    "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
    Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Resolved: "bg-green-100 text-green-700 border-green-200",
    Closed: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
};

const getSLAColor = (status: string) => {
  if (status === "breach") return "text-red-600";
  if (status === "risk") return "text-orange-600";
  return "text-gray-600";
};

export function TicketList() {
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");

  const toggleTicket = (id: string) => {
    setSelectedTickets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedTickets((prev) =>
      prev.length === tickets.length ? [] : tickets.map((t) => t.id)
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tickets</h1>
            <p className="text-sm text-gray-500 mt-1">{tickets.length} total tickets</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Tickets</TabsTrigger>
            <TabsTrigger value="mine">Assigned to Me</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search tickets by ID, subject, requester..."
              className="pl-10 bg-gray-50 border-gray-200"
            />
          </div>
          {selectedTickets.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedTickets.length} selected</span>
              <Button variant="outline" size="sm">
                Assign
              </Button>
              <Button variant="outline" size="sm">
                Change Status
              </Button>
              <Button variant="outline" size="sm">
                Bulk Actions
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <Table>
          <TableHeader className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedTickets.length === tickets.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedTickets.includes(ticket.id)}
                    onCheckedChange={() => toggleTicket(ticket.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/tickets/${ticket.id}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {ticket.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link to={`/tickets/${ticket.id}`} className="block max-w-md">
                    <span className="text-sm text-gray-900 line-clamp-1">{ticket.subject}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-xs">
                        {ticket.requester.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-900">{ticket.requester}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {ticket.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          {ticket.assignee.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-900">{ticket.assignee}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getStatusColor(ticket.status)}`}>
                    {ticket.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-sm font-medium ${getSLAColor(ticket.slaStatus)}`}>
                    {ticket.sla}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{ticket.created}</span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View</DropdownMenuItem>
                      <DropdownMenuItem>Assign</DropdownMenuItem>
                      <DropdownMenuItem>Change Priority</DropdownMenuItem>
                      <DropdownMenuItem>Merge</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
