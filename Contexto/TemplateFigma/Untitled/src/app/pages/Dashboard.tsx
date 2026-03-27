import { 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  Users,
  Zap,
  Bot,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { AIInsight } from "../components/ui/ai-insight";

const kpiData = [
  {
    title: "Open Tickets",
    value: "247",
    change: "+12%",
    trend: "up",
    icon: AlertCircle,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: "Overdue",
    value: "18",
    change: "-5%",
    trend: "down",
    icon: Clock,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  {
    title: "Resolved Today",
    value: "34",
    change: "+8%",
    trend: "up",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    title: "Avg Resolution Time",
    value: "4.2h",
    change: "-15%",
    trend: "down",
    icon: TrendingUp,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
];

const weeklyData = [
  { day: "Mon", tickets: 42, resolved: 38 },
  { day: "Tue", tickets: 38, resolved: 35 },
  { day: "Wed", tickets: 45, resolved: 40 },
  { day: "Thu", tickets: 52, resolved: 45 },
  { day: "Fri", tickets: 48, resolved: 50 },
  { day: "Sat", tickets: 15, resolved: 12 },
  { day: "Sun", tickets: 8, resolved: 10 },
];

const priorityData = [
  { name: "Critical", value: 18, color: "#ef4444" },
  { name: "High", value: 45, color: "#f97316" },
  { name: "Medium", value: 82, color: "#eab308" },
  { name: "Low", value: 102, color: "#22c55e" },
];

const priorityTickets = [
  {
    id: "TKT-1247",
    title: "Production server down - Database connection failing",
    priority: "Critical",
    requester: "Sarah Johnson",
    time: "5 min ago",
    status: "Open",
  },
  {
    id: "TKT-1246",
    title: "Cannot access email on mobile device",
    priority: "High",
    requester: "Mike Chen",
    time: "12 min ago",
    status: "In Progress",
  },
  {
    id: "TKT-1245",
    title: "Request for new software license - Adobe Creative Cloud",
    priority: "High",
    requester: "Emma Davis",
    time: "25 min ago",
    status: "Pending",
  },
  {
    id: "TKT-1244",
    title: "VPN connection intermittent issues",
    priority: "Medium",
    requester: "Alex Turner",
    time: "1 hour ago",
    status: "In Progress",
  },
];

const recentActivity = [
  { user: "John Doe", action: "resolved", ticket: "TKT-1243", time: "2 min ago" },
  { user: "Lisa Wang", action: "commented on", ticket: "TKT-1240", time: "8 min ago" },
  { user: "Tom Harris", action: "assigned", ticket: "TKT-1239", time: "15 min ago" },
  { user: "Sarah Johnson", action: "created", ticket: "TKT-1247", time: "5 min ago" },
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

export function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, John. Here's your service desk overview.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{kpi.title}</p>
                  <p className="text-3xl font-semibold mt-2">{kpi.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <span
                      className={`text-xs font-medium ${
                        kpi.trend === "up" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {kpi.change}
                    </span>
                    <span className="text-xs text-gray-500">vs last week</span>
                  </div>
                </div>
                <div className={`w-12 h-12 ${kpi.bgColor} rounded-lg flex items-center justify-center`}>
                  <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI Insights</CardTitle>
              <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 gap-1">
                <Sparkles className="w-3 h-3" />
                AI Powered
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <AIInsight
              type="analysis"
              title="Pattern Detected"
              content="15 similar database connection issues reported in the last 2 hours. Possible infrastructure problem."
              confidence={87}
            />
            <AIInsight
              type="suggestion"
              title="Recommendation"
              content="Consider creating a Problem ticket to investigate recurring database timeout issues."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-gray-600">Auto-Classification Rate</span>
                  </div>
                  <span className="text-sm font-medium">94%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: "94%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm text-gray-600">AI-Resolved (No Human)</span>
                  </div>
                  <span className="text-sm font-medium">23%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: "23%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-gray-600">AI-Assisted Resolution</span>
                  </div>
                  <span className="text-sm font-medium">68%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: "68%" }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Trends */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ticket Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip />
                <Bar key="tickets-bar" dataKey="tickets" fill="#6366f1" radius={[4, 4, 0, 0]} name="New Tickets" />
                <Bar key="resolved-bar" dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolved" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-indigo-600 rounded-sm"></div>
                <span className="text-sm text-gray-600">New Tickets</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                <span className="text-sm text-gray-600">Resolved</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SLA Health */}
        <Card>
          <CardHeader>
            <CardTitle>SLA Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">On Track</span>
                <span className="text-sm font-medium">85%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: "85%" }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">At Risk</span>
                <span className="text-sm font-medium">12%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: "12%" }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Breached</span>
                <span className="text-sm font-medium">3%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: "3%" }}></div>
              </div>
            </div>
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-600">94% compliance this month</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Tickets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Priority Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {priorityTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">{ticket.id}</span>
                      <Badge className={`text-xs border ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </Badge>
                      <Badge className={`text-xs border ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">{ticket.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-xs">
                            {ticket.requester.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span>{ticket.requester}</span>
                      </div>
                      <span>•</span>
                      <span>{ticket.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-gray-100">
                      {activity.user.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.user}</span>{" "}
                      <span className="text-gray-600">{activity.action}</span>{" "}
                      <span className="font-medium text-indigo-600">{activity.ticket}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}