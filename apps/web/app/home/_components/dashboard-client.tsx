'use client';

import Link from 'next/link';

import {
  AlertCircle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Zap,
  Bot,
  Sparkles,
  Building2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import { AIInsight } from '@kit/ui/itsm';

import type { DashboardData } from '../page';

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

interface DashboardClientProps {
  data: DashboardData;
}

/* -------------------------------------------------------------------------- */
/*  Color helpers                                                              */
/* -------------------------------------------------------------------------- */

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };
  return colors[priority] ?? 'bg-gray-100 text-gray-700';
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Open: 'bg-blue-100 text-blue-700 border-blue-200',
    'In Progress': 'bg-purple-100 text-purple-700 border-purple-200',
    Pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Testing: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    Resolved: 'bg-green-100 text-green-700 border-green-200',
    Closed: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-700';
};

/* -------------------------------------------------------------------------- */
/*  KPI Card config                                                            */
/* -------------------------------------------------------------------------- */

function buildKpiCards(data: DashboardData['kpis']) {
  return [
    {
      title: 'Open Tickets',
      value: String(data.openTickets),
      change: `${data.openTicketsChange >= 0 ? '+' : ''}${data.openTicketsChange}%`,
      trend: data.openTicketsChange >= 0 ? 'up' : 'down',
      icon: AlertCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Overdue',
      value: String(data.overdue),
      change: `${data.overdueChange >= 0 ? '+' : ''}${data.overdueChange}%`,
      trend: data.overdueChange >= 0 ? 'up' : 'down',
      icon: Clock,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Resolved Today',
      value: String(data.resolvedToday),
      change: `${data.resolvedTodayChange >= 0 ? '+' : ''}${data.resolvedTodayChange}%`,
      trend: data.resolvedTodayChange >= 0 ? 'up' : 'down',
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Avg Resolution Time',
      value: `${data.avgResolutionTimeHours}h`,
      change: `${data.avgResolutionTimeChange >= 0 ? '+' : ''}${data.avgResolutionTimeChange}%`,
      trend: data.avgResolutionTimeChange >= 0 ? 'up' : 'down',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ] as const;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function DashboardClient({ data }: DashboardClientProps) {
  const kpiCards = buildKpiCards(data.kpis);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Welcome back, {data.userName}. Here&apos;s your service desk overview.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <Card key={kpi.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {kpi.title}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{kpi.value}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <span
                        className={`text-xs font-medium ${
                          kpi.trend === 'up'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {kpi.change}
                      </span>
                      <span className="text-xs text-gray-500">
                        vs last week
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${kpi.bgColor}`}
                  >
                    <Icon className={`h-6 w-6 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* AI Insights Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AI Insights */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI Insights</CardTitle>
              <Badge className="gap-1 border-0 bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
                <Sparkles className="h-3 w-3" />
                AI Powered
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.aiInsights.map((insight, idx) => (
              <AIInsight
                key={idx}
                type={insight.type}
                title={insight.title}
                content={insight.content}
                confidence={insight.confidence}
              />
            ))}
          </CardContent>
        </Card>

        {/* AI Performance */}
        <Card>
          <CardHeader>
            <CardTitle>AI Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-purple-600" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Auto-Classification Rate
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {data.aiPerformance.autoClassificationRate}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{
                      width: `${data.aiPerformance.autoClassificationRate}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      AI-Resolved (No Human)
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {data.aiPerformance.aiResolvedNoHuman}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${data.aiPerformance.aiResolvedNoHuman}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      AI-Assisted Resolution
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {data.aiPerformance.aiAssistedResolution}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{
                      width: `${data.aiPerformance.aiAssistedResolution}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ticket Trends + SLA Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ticket Trends */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ticket Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip />
                <Bar
                  dataKey="tickets"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  name="New Tickets"
                />
                <Bar
                  dataKey="resolved"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="Resolved"
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-indigo-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  New Tickets
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-green-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Resolved
                </span>
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
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  On Track
                </span>
                <span className="text-sm font-medium">
                  {data.slaHealth.onTrack}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${data.slaHealth.onTrack}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  At Risk
                </span>
                <span className="text-sm font-medium">
                  {data.slaHealth.atRisk}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-500"
                  style={{ width: `${data.slaHealth.atRisk}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Breached
                </span>
                <span className="text-sm font-medium">
                  {data.slaHealth.breached}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${data.slaHealth.breached}%` }}
                />
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-green-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {data.slaHealth.complianceThisMonth}% compliance this month
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Priority Tickets + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Priority Tickets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Priority Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.priorityTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/home/tickets/${ticket.ticketId}`}
                  className="block"
                >
                  <div className="flex cursor-pointer items-start gap-4 rounded-lg border border-gray-200 p-4 transition-all hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:hover:border-indigo-600">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {ticket.id}
                        </span>
                        <Badge className={`border text-xs ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                        </Badge>
                        <Badge className={`border text-xs ${getStatusColor(ticket.status)}`}>
                          {ticket.status}
                        </Badge>
                        {ticket.orgName && (
                          <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-[10px] text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            <Building2 className="h-3 w-3" />
                            {ticket.orgName}
                          </Badge>
                        )}
                      </div>
                      <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {ticket.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-xs">
                              {ticket.requester.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{ticket.requester}</span>
                        </div>
                        <span>&bull;</span>
                        <span>{ticket.time}</span>
                      </div>
                    </div>
                  </div>
                </Link>
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
              {data.recentActivity.map((activity, index) => (
                <div key={index} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-100 text-xs dark:bg-gray-800">
                      {activity.user
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">{activity.user}</span>{' '}
                      <span className="text-gray-600 dark:text-gray-400">
                        {activity.action}
                      </span>{' '}
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {activity.ticket}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {activity.time}
                    </p>
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
