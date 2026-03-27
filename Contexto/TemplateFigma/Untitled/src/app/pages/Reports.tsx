import { Calendar, Download, TrendingUp, Clock, CheckCircle2, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const monthlyData = [
  { month: "Jan", created: 245, resolved: 230, slaCompliance: 92 },
  { month: "Feb", created: 268, resolved: 255, slaCompliance: 89 },
  { month: "Mar", created: 290, resolved: 285, slaCompliance: 94 },
  { month: "Apr", created: 312, resolved: 298, slaCompliance: 91 },
  { month: "May", created: 298, resolved: 305, slaCompliance: 93 },
  { month: "Jun", created: 276, resolved: 280, slaCompliance: 95 },
];

const priorityData = [
  { name: "Critical", value: 18, color: "#ef4444" },
  { name: "High", value: 45, color: "#f97316" },
  { name: "Medium", value: 82, color: "#eab308" },
  { name: "Low", value: 102, color: "#22c55e" },
];

const categoryData = [
  { category: "Hardware", tickets: 89 },
  { category: "Software", tickets: 124 },
  { category: "Network", tickets: 67 },
  { category: "Access", tickets: 98 },
  { category: "Other", tickets: 45 },
];

const agentPerformance = [
  { agent: "John Doe", resolved: 87, avgTime: "3.2h", satisfaction: 4.8 },
  { agent: "Lisa Wang", resolved: 92, avgTime: "2.8h", satisfaction: 4.9 },
  { agent: "Tom Harris", resolved: 76, avgTime: "3.5h", satisfaction: 4.6 },
  { agent: "Sarah Miller", resolved: 81, avgTime: "3.1h", satisfaction: 4.7 },
];

export function Reports() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Track performance and operational metrics</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="w-4 h-4" />
              Last 6 Months
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tickets</p>
                <p className="text-3xl font-semibold mt-1">1,689</p>
                <p className="text-xs text-green-600 mt-2">+12% from last period</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Resolution Time</p>
                <p className="text-3xl font-semibold mt-1">3.1h</p>
                <p className="text-xs text-green-600 mt-2">-8% improvement</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">SLA Compliance</p>
                <p className="text-3xl font-semibold mt-1">93%</p>
                <p className="text-xs text-green-600 mt-2">+2% from target</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Satisfaction Score</p>
                <p className="text-3xl font-semibold mt-1">4.7</p>
                <p className="text-xs text-green-600 mt-2">+0.2 improvement</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Ticket Trends */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ticket Volume Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip />
                <Legend />
                <Line
                  key="created-line"
                  type="monotone"
                  dataKey="created"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name="Created"
                />
                <Line
                  key="resolved-line"
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Resolved"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  key="priority-pie"
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {priorityData.map((entry, index) => (
                    <Cell key={`priority-cell-${entry.name}-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip />
                <Bar key="category-bar" dataKey="tickets" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Performance (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentPerformance.map((agent) => (
                <div key={agent.agent} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{agent.agent}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span>{agent.resolved} resolved</span>
                      <span>•</span>
                      <span>{agent.avgTime} avg time</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-2xl font-semibold text-yellow-500">★</span>
                    <span className="font-medium text-gray-900">{agent.satisfaction}</span>
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