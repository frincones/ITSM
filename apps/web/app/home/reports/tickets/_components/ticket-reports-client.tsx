'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Filter,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
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

interface TicketReportsClientProps {
  tickets: Array<{ status: string | null; type: string | null }>;
  agents: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
}

/* -------------------------------------------------------------------------- */
/*  Metric card definitions                                                    */
/* -------------------------------------------------------------------------- */

interface MetricCard {
  label: string;
  statusFilter: string;
  typeFilter: string;
  color: string;
  bgColor: string;
  trend: number; // % change vs previous period (mock)
}

const METRIC_DEFINITIONS: MetricCard[] = [
  {
    label: 'Casos Cerrados Garantia',
    statusFilter: 'closed',
    typeFilter: 'warranty',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    trend: 12,
  },
  {
    label: 'Casos Cerrados Soporte',
    statusFilter: 'closed',
    typeFilter: 'support',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    trend: 8,
  },
  {
    label: 'Casos Nuevo Garantia',
    statusFilter: 'new',
    typeFilter: 'warranty',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    trend: -3,
  },
  {
    label: 'Casos Nuevo Soporte',
    statusFilter: 'new',
    typeFilter: 'support',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    trend: 5,
  },
  {
    label: 'Casos en Progreso Garantia',
    statusFilter: 'in_progress',
    typeFilter: 'warranty',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    trend: -2,
  },
  {
    label: 'Casos en Progreso Soporte',
    statusFilter: 'in_progress',
    typeFilter: 'support',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    trend: 15,
  },
  {
    label: 'Nuevos Testing Garantia',
    statusFilter: 'testing',
    typeFilter: 'warranty',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    trend: 0,
  },
  {
    label: 'Nuevos Testing Soporte',
    statusFilter: 'testing',
    typeFilter: 'support',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    trend: 4,
  },
  {
    label: 'Pendientes Garantia',
    statusFilter: 'pending',
    typeFilter: 'warranty',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    trend: -7,
  },
  {
    label: 'Pendientes Soporte',
    statusFilter: 'pending',
    typeFilter: 'support',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    trend: 3,
  },
  {
    label: 'Casos Fracaso Testing',
    statusFilter: 'testing_failed',
    typeFilter: '',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    trend: -10,
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TicketReportsClient({
  tickets,
  agents,
  groups,
}: TicketReportsClientProps) {
  const [dateRange, setDateRange] = useState('30days');
  const [agentFilter, setAgentFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');

  // Compute counts from real tickets data
  const metricCounts = useMemo(() => {
    return METRIC_DEFINITIONS.map((def) => {
      const count = tickets.filter((t) => {
        const statusMatch =
          !def.statusFilter || t.status === def.statusFilter;
        const typeMatch = !def.typeFilter || t.type === def.typeFilter;
        return statusMatch && typeMatch;
      }).length;
      return { ...def, count };
    });
  }, [tickets]);

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/home/reports">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Ticket Reports
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Granular ticket metrics by status and type
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
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

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {metricCounts.map((metric) => (
          <Card key={metric.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-gray-600 leading-tight">
                  {metric.label}
                </p>
                <div
                  className={`w-8 h-8 ${metric.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
                >
                  {getTrendIcon(metric.trend)}
                </div>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-semibold text-gray-900">
                  {metric.count}
                </p>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-xs font-medium ${getTrendColor(metric.trend)}`}
                  >
                    {metric.trend > 0 ? '+' : ''}
                    {metric.trend}%
                  </span>
                  <span className="text-xs text-gray-400">vs prev</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
