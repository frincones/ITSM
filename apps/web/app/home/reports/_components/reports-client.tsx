'use client';

import { useRouter } from 'next/navigation';

import {
  BarChart3, TrendingUp, TrendingDown, Clock, CheckCircle,
  AlertTriangle, Users, FolderOpen, Building2, Download,
  Filter, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@kit/ui/select';

import type { ReportDashboard } from '~/lib/services/metrics.service';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReportsClientProps {
  dashboard: ReportDashboard | null;
  organizations: Array<{ id: string; name: string }>;
  selectedOrg: string | null;
  dateFrom: string;
  dateTo: string;
  isClient?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Colors                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6', assigned: '#06b6d4', in_progress: '#f59e0b',
  pending: '#f97316', testing: '#8b5cf6', resolved: '#22c55e',
  closed: '#6b7280', cancelled: '#ef4444',
};

const TYPE_COLORS: Record<string, string> = {
  support: '#3b82f6', incident: '#ef4444', backlog: '#8b5cf6',
  request: '#06b6d4', warranty: '#f59e0b',
};

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
};

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6b7280'];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ReportsClient({
  dashboard,
  organizations,
  selectedOrg,
  dateFrom,
  dateTo,
  isClient = false,
}: ReportsClientProps) {
  const router = useRouter();

  const d = dashboard ?? {
    totalTickets: 0, openTickets: 0, closedTickets: 0,
    avgResolutionMinutes: null,
    slaCompliance: { rate: 0, met: 0, breached: 0, total: 0 },
    byStatus: [], byType: [], byCategory: [], byUrgency: [],
    byAgent: [], byOrganization: [], dailyTrend: [], gestionSoporte: [],
  };

  const handleOrgChange = (val: string) => {
    const p = new URLSearchParams();
    if (val !== 'all') p.set('org', val);
    p.set('from', dateFrom);
    p.set('to', dateTo);
    router.push(`/home/reports?${p.toString()}`);
  };

  const handleDateChange = (range: string) => {
    const now = new Date();
    let from = dateFrom;
    if (range === '7d') from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    else if (range === '30d') from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    else if (range === '90d') from = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    else if (range === '1y') from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);

    const p = new URLSearchParams();
    if (selectedOrg) p.set('org', selectedOrg);
    p.set('from', from);
    p.set('to', dateTo);
    router.push(`/home/reports?${p.toString()}`);
  };

  const resHours = d.avgResolutionMinutes ? (d.avgResolutionMinutes / 60).toFixed(1) : '--';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {dateFrom} — {dateTo} | {d.totalTickets} tickets
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isClient && (
            <Select value={selectedOrg ?? 'all'} onValueChange={handleOrgChange}>
              <SelectTrigger className="w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Organización" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las organizaciones</SelectItem>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select defaultValue="1y" onValueChange={handleDateChange}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 días</SelectItem>
              <SelectItem value="30d">30 días</SelectItem>
              <SelectItem value="90d">90 días</SelectItem>
              <SelectItem value="1y">1 año</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => exportReportsCsv(d, dateFrom, dateTo)}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => router.push('/home/reports/gestion-soporte')}
          >
            <Activity className="mr-2 h-4 w-4" /> Reporte Gestión Soporte
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard title="Total Tickets" value={d.totalTickets} icon={BarChart3} color="text-indigo-600" />
        <KpiCard title="Abiertos" value={d.openTickets} icon={FolderOpen} color="text-orange-500" />
        <KpiCard title="Cerrados" value={d.closedTickets} icon={CheckCircle} color="text-green-600" />
        <KpiCard title="Tiempo Resolución" value={`${resHours}h`} icon={Clock} color="text-blue-500" />
        <KpiCard title="SLA Compliance" value={`${d.slaCompliance.rate}%`} icon={d.slaCompliance.rate >= 80 ? TrendingUp : AlertTriangle} color={d.slaCompliance.rate >= 80 ? 'text-green-600' : 'text-red-500'} />
      </div>

      {/* ── Gestión Soporte (Type x Status Matrix) ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Reporte Gestión Soporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Indicador</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {d.gestionSoporte.map((g, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2">{g.label}</td>
                    <td className="px-3 py-2 text-right font-semibold">{g.count}</td>
                  </tr>
                ))}
                {d.gestionSoporte.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Charts Row 1: Status + Type + Urgency ────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Por Estado</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }: any) => `${status} (${count})`}>
                  {d.byStatus.map((s, i) => (
                    <Cell key={i} fill={STATUS_COLORS[s.status] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Por Tipo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ type, count }: any) => `${type} (${count})`}>
                  {d.byType.map((t, i) => (
                    <Cell key={i} fill={TYPE_COLORS[t.type] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Por Urgencia</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={d.byUrgency}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="urgency" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count">
                  {d.byUrgency.map((u, i) => (
                    <Cell key={i} fill={URGENCY_COLORS[u.urgency] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2: Category + Organization ────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Por Categoría / Módulo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={d.byCategory.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="category_name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Por Organización</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={d.byOrganization} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="org_name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Trend Chart ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Tendencia Diaria (Creados vs Cerrados)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={d.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#6366f1" name="Creados" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closed" stroke="#22c55e" name="Cerrados" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Agent Performance ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Rendimiento por Agente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Agente</th>
                  <th className="px-3 py-2 text-right font-medium">Asignados</th>
                  <th className="px-3 py-2 text-right font-medium">Resueltos</th>
                  <th className="px-3 py-2 text-right font-medium">% Resolución</th>
                  <th className="px-3 py-2 text-right font-medium">Tiempo Prom.</th>
                  <th className="px-3 py-2 text-right font-medium">SLA Met</th>
                  <th className="px-3 py-2 text-right font-medium">SLA Breached</th>
                </tr>
              </thead>
              <tbody>
                {d.byAgent.map((a) => (
                  <tr key={a.agent_id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{a.agent_name}</td>
                    <td className="px-3 py-2 text-right">{a.tickets_assigned}</td>
                    <td className="px-3 py-2 text-right">{a.tickets_resolved}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant={a.tickets_assigned > 0 && a.tickets_resolved / a.tickets_assigned >= 0.8 ? 'default' : 'secondary'}>
                        {a.tickets_assigned > 0 ? Math.round((a.tickets_resolved / a.tickets_assigned) * 100) : 0}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {a.avg_resolution_minutes ? `${(a.avg_resolution_minutes / 60).toFixed(1)}h` : '--'}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600">{a.sla_met_count}</td>
                    <td className="px-3 py-2 text-right text-red-500">{a.sla_breached_count}</td>
                  </tr>
                ))}
                {d.byAgent.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Sin datos de agentes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI Card                                                                   */
/* -------------------------------------------------------------------------- */

function KpiCard({
  title, value, icon: Icon, color,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}


function exportReportsCsv(
  d: ReportDashboard,
  from: string,
  to: string,
): void {
  const lines: string[] = [];
  lines.push('Reports & Analytics');
  lines.push(`Rango:,${from},${to}`);
  lines.push('');

  lines.push('KPIs');
  lines.push(`Total tickets,${d.totalTickets}`);
  lines.push(`Abiertos,${d.openTickets}`);
  lines.push(`Cerrados,${d.closedTickets}`);
  lines.push(
    `Tiempo promedio resolución (h),${
      d.avgResolutionMinutes ? (d.avgResolutionMinutes / 60).toFixed(2) : ''
    }`,
  );
  lines.push(
    `SLA Compliance (%),${d.slaCompliance?.rate ?? ''}`,
  );
  lines.push('');

  lines.push('Gestión Soporte');
  lines.push('Indicador,Cantidad');
  (d.gestionSoporte ?? []).forEach((g) => {
    lines.push(`${escapeCsv(g.label)},${g.count}`);
  });
  lines.push('');

  lines.push('Por Estado');
  lines.push('Estado,Cantidad');
  (d.byStatus ?? []).forEach((r: { status: string; count: number }) => {
    lines.push(`${escapeCsv(r.status)},${r.count}`);
  });
  lines.push('');

  lines.push('Por Tipo');
  lines.push('Tipo,Cantidad');
  (d.byType ?? []).forEach((r: { type: string; count: number }) => {
    lines.push(`${escapeCsv(r.type)},${r.count}`);
  });
  lines.push('');

  lines.push('Por Urgencia');
  lines.push('Urgencia,Cantidad');
  (d.byUrgency ?? []).forEach((r: { urgency: string; count: number }) => {
    lines.push(`${escapeCsv(r.urgency)},${r.count}`);
  });

  const csv = lines.join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reports-${from}-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
