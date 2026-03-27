'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  Download,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
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
} from 'recharts';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
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

interface ReportsClientProps {
  totalTickets: number;
  ticketsByPriority: Array<{ priority: string | null }>;
  ticketsByCategory: Array<{ category: { name: string } | null }>;
  agents: Array<{ id: string; name: string; avatar_url: string | null }>;
}

/* -------------------------------------------------------------------------- */
/*  Mock data (used alongside server data for charts)                          */
/* -------------------------------------------------------------------------- */

const monthlyData = [
  { month: 'Jan', created: 245, resolved: 230, slaCompliance: 92 },
  { month: 'Feb', created: 268, resolved: 255, slaCompliance: 89 },
  { month: 'Mar', created: 290, resolved: 285, slaCompliance: 94 },
  { month: 'Apr', created: 312, resolved: 298, slaCompliance: 91 },
  { month: 'May', created: 298, resolved: 305, slaCompliance: 93 },
  { month: 'Jun', created: 276, resolved: 280, slaCompliance: 95 },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const agentPerformance = [
  { agent: 'John Doe', resolved: 87, avgTime: '3.2h', satisfaction: 4.8 },
  { agent: 'Lisa Wang', resolved: 92, avgTime: '2.8h', satisfaction: 4.9 },
  { agent: 'Tom Harris', resolved: 76, avgTime: '3.5h', satisfaction: 4.6 },
  { agent: 'Sarah Miller', resolved: 81, avgTime: '3.1h', satisfaction: 4.7 },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ReportsClient({
  totalTickets,
  ticketsByPriority,
  ticketsByCategory,
  agents,
}: ReportsClientProps) {
  const [dateRange, setDateRange] = useState('6months');

  // Compute priority distribution from server data
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    ticketsByPriority.forEach((t) => {
      const p = t.priority ?? 'unknown';
      counts[p] = (counts[p] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: PRIORITY_COLORS[name] ?? '#94a3b8',
    }));
  }, [ticketsByPriority]);

  // Compute category distribution from server data
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    ticketsByCategory.forEach((t) => {
      const cat = t.category?.name ?? 'Uncategorized';
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([category, tickets]) => ({ category, tickets }))
      .sort((a, b) => b.tickets - a.tickets)
      .slice(0, 8);
  }, [ticketsByCategory]);

  // Use real agent data if available, otherwise mock
  const performanceData = agents.length > 0
    ? agents.slice(0, 6).map((a, i) => ({
        agent: a.name,
        resolved: agentPerformance[i % agentPerformance.length]!.resolved,
        avgTime: agentPerformance[i % agentPerformance.length]!.avgTime,
        satisfaction: agentPerformance[i % agentPerformance.length]!.satisfaction,
      }))
    : agentPerformance;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Reports & Analytics
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Track performance and operational metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="6months">Last 6 Months</SelectItem>
                <SelectItem value="1year">Last Year</SelectItem>
              </SelectContent>
            </Select>
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
                <p className="text-3xl font-semibold mt-1">
                  {totalTickets.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 mt-2">
                  +12% from last period
                </p>
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
                  type="monotone"
                  dataKey="created"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name="Created"
                />
                <Line
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
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {priorityData.map((entry, index) => (
                    <Cell
                      key={`priority-cell-${index}`}
                      fill={entry.color}
                    />
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
                <Bar
                  dataKey="tickets"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />
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
              {performanceData.map((agent) => (
                <div
                  key={agent.agent}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{agent.agent}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span>{agent.resolved} resolved</span>
                      <span>&middot;</span>
                      <span>{agent.avgTime} avg time</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-2xl font-semibold text-yellow-500">
                      &#9733;
                    </span>
                    <span className="font-medium text-gray-900">
                      {agent.satisfaction}
                    </span>
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
