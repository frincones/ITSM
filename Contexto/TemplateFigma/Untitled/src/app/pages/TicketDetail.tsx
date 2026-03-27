import { useState } from "react";
import { useParams, Link } from "react-router";
import {
  ArrowLeft,
  Clock,
  User,
  Mail,
  Phone,
  Building,
  Paperclip,
  Send,
  MessageSquare,
  Eye,
  MoreHorizontal,
  ChevronDown,
  Sparkles,
  Brain,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { AIInsight, AIAssistChip } from "../components/ui/ai-insight";

const ticketData = {
  id: "TKT-1247",
  subject: "Production server down - Database connection failing",
  status: "Open",
  priority: "Critical",
  type: "Incident",
  channel: "Email",
  created: "March 27, 2026 at 10:35 AM",
  updated: "March 27, 2026 at 10:40 AM",
  sla: "15 minutes remaining",
  slaStatus: "breach",
  requester: {
    name: "Sarah Johnson",
    email: "sarah.johnson@company.com",
    phone: "+1 (555) 123-4567",
    department: "Engineering",
    title: "Senior Software Engineer",
  },
  assignee: {
    name: "John Doe",
    email: "john.doe@company.com",
  },
  group: "Infrastructure Team",
  tags: ["database", "production", "critical"],
  relatedAssets: [
    { id: "SRV-001", name: "Production Database Server", type: "Server" },
  ],
  timeline: [
    {
      id: 1,
      type: "created",
      user: "Sarah Johnson",
      timestamp: "10:35 AM",
      content: "Ticket created via email",
    },
    {
      id: 2,
      type: "comment",
      user: "Sarah Johnson",
      timestamp: "10:35 AM",
      isPublic: true,
      content:
        "Our production application is unable to connect to the database server. Users are reporting 500 errors across the platform. This started approximately 10 minutes ago. Error logs show: 'Connection timeout - Unable to reach database server at 10.0.1.50:5432'",
      attachments: ["error-logs.txt", "screenshot.png"],
    },
    {
      id: 3,
      type: "assigned",
      user: "System",
      timestamp: "10:36 AM",
      content: "Ticket assigned to John Doe (Infrastructure Team)",
    },
    {
      id: 4,
      type: "note",
      user: "John Doe",
      timestamp: "10:38 AM",
      isPublic: false,
      content: "Checking database server status. Initial diagnosis shows network connectivity issues.",
    },
    {
      id: 5,
      type: "status",
      user: "John Doe",
      timestamp: "10:40 AM",
      content: "Status changed from New to In Progress",
    },
  ],
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

export function TicketDetail() {
  const { id } = useParams();
  const [replyMode, setReplyMode] = useState<"public" | "internal">("public");
  const [replyText, setReplyText] = useState("");

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/tickets">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-500">{ticketData.id}</span>
                <Badge className={`text-xs border ${getStatusColor(ticketData.status)}`}>
                  {ticketData.status}
                </Badge>
                <Badge className={`text-xs border ${getPriorityColor(ticketData.priority)}`}>
                  {ticketData.priority}
                </Badge>
                <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                  {ticketData.type}
                </Badge>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">{ticketData.subject}</h1>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Select defaultValue={ticketData.status}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select defaultValue={ticketData.priority}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm">
              Assign
            </Button>
            <Button variant="outline" size="sm">
              Escalate
            </Button>
            <Button variant="outline" size="sm">
              Merge
            </Button>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            {ticketData.timeline.map((event) => (
              <div key={event.id}>
                {event.type === "comment" || event.type === "note" ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {event.user.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{event.user}</span>
                              {event.type === "note" ? (
                                <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                                  <Eye className="w-3 h-3 mr-1" />
                                  Internal Note
                                </Badge>
                              ) : (
                                <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  Public Reply
                                </Badge>
                              )}
                            </div>
                            <span className="text-sm text-gray-500">{event.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.content}</p>
                      {event.attachments && event.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {event.attachments.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm"
                            >
                              <Paperclip className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700">{file}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <Clock className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">{event.user}</span>{" "}
                        {event.content}
                      </p>
                      <span className="text-xs text-gray-500">{event.timestamp}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Reply Composer */}
        <div className="bg-white border-t border-gray-200 p-6">
          <div className="max-w-4xl mx-auto">
            <Tabs value={replyMode} onValueChange={(v) => setReplyMode(v as "public" | "internal")}>
              <TabsList className="mb-4">
                <TabsTrigger value="public" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Public Reply
                </TabsTrigger>
                <TabsTrigger value="internal" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Internal Note
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Textarea
              placeholder={
                replyMode === "public"
                  ? "Write a response to the requester..."
                  : "Add an internal note (not visible to requester)..."
              }
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="min-h-[100px] mb-3"
            />

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-2">
                <Paperclip className="w-4 h-4" />
                Attach Files
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  Macros
                </Button>
                <Button size="sm" className="gap-2">
                  <Send className="w-4 h-4" />
                  {replyMode === "public" ? "Send Reply" : "Add Note"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <aside className="w-80 bg-white border-l border-gray-200 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Requester Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Requester</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback>
                    {ticketData.requester.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{ticketData.requester.name}</p>
                  <p className="text-sm text-gray-600">{ticketData.requester.title}</p>
                </div>
              </div>
              <div className="space-y-2 pl-13">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{ticketData.requester.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{ticketData.requester.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{ticketData.requester.department}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Assistant Panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">AI Assistant</h3>
              <AIAssistChip />
            </div>
            
            <div className="space-y-3">
              <AIInsight
                type="classification"
                title="Auto Classification"
                content="Incident - Database connectivity issue"
                confidence={95}
              />
              
              <AIInsight
                type="suggestion"
                title="Suggested Solution"
                content="Check database server firewall rules and verify network connectivity to port 5432."
                confidence={88}
              />
              
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Similar Tickets</span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-purple-800">
                    <p className="font-medium">TKT-1145</p>
                    <p className="text-purple-700">Resolved in 25 min • 85% similarity</p>
                  </div>
                  <div className="text-xs text-purple-800">
                    <p className="font-medium">TKT-0892</p>
                    <p className="text-purple-700">Resolved in 18 min • 78% similarity</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Ticket Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Ticket Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Assignee</p>
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs">
                      {ticketData.assignee.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-900">{ticketData.assignee.name}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Group</p>
                <p className="text-sm text-gray-900">{ticketData.group}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Channel</p>
                <p className="text-sm text-gray-900">{ticketData.channel}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Created</p>
                <p className="text-sm text-gray-900">{ticketData.created}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Last Updated</p>
                <p className="text-sm text-gray-900">{ticketData.updated}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* SLA */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">SLA</h3>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">At Risk</span>
              </div>
              <p className="text-sm text-red-900">{ticketData.sla}</p>
            </div>
          </div>

          <Separator />

          {/* Tags */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {ticketData.tags.map((tag) => (
                <Badge key={tag} className="bg-gray-100 text-gray-700 border-gray-200">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Related Assets */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Related Assets</h3>
            <div className="space-y-2">
              {ticketData.relatedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900">{asset.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {asset.type} • {asset.id}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}