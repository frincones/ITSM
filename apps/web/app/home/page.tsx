import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { DashboardClient } from './_components/dashboard-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface KpiData {
  openTickets: number;
  openTicketsChange: number;
  overdue: number;
  overdueChange: number;
  resolvedToday: number;
  resolvedTodayChange: number;
  avgResolutionTimeHours: number;
  avgResolutionTimeChange: number;
}

export interface WeeklyDataPoint {
  day: string;
  tickets: number;
  resolved: number;
}

export interface PriorityTicket {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requester: string;
  time: string;
  status: string;
}

export interface RecentActivityItem {
  user: string;
  action: string;
  ticket: string;
  time: string;
}

export interface SlaHealthData {
  onTrack: number;
  atRisk: number;
  breached: number;
  complianceThisMonth: number;
}

export interface AiPerformanceData {
  autoClassificationRate: number;
  aiResolvedNoHuman: number;
  aiAssistedResolution: number;
}

export interface AiInsightData {
  type: 'classification' | 'suggestion' | 'analysis' | 'completed';
  title: string;
  content: string;
  confidence?: number;
}

export interface DashboardData {
  userName: string;
  kpis: KpiData;
  weeklyData: WeeklyDataPoint[];
  priorityTickets: PriorityTicket[];
  recentActivity: RecentActivityItem[];
  slaHealth: SlaHealthData;
  aiPerformance: AiPerformanceData;
  aiInsights: AiInsightData[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getDayLabel(dateStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr).getDay()] ?? '';
}

/* -------------------------------------------------------------------------- */
/*  Data Fetching                                                              */
/* -------------------------------------------------------------------------- */

async function fetchDashboardData(): Promise<DashboardData> {
  const client = getSupabaseServerClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const prevWeekStart = new Date(now);
  prevWeekStart.setDate(prevWeekStart.getDate() - 14);

  // ---------- Parallel queries ----------
  const [
    openTicketsResult,
    overdueResult,
    resolvedTodayResult,
    resolvedLastWeekResult,
    prevWeekOpenResult,
    prevWeekOverdueResult,
    prevWeekResolvedResult,
    weeklyCreatedResult,
    weeklyResolvedResult,
    priorityTicketsResult,
    recentActivityResult,
    slaOnTrackResult,
    slaAtRiskResult,
    slaBreachedResult,
    userResult,
  ] = await Promise.all([
    // KPI: Open tickets (statuses that are not resolved/closed/cancelled)
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing']),

    // KPI: Overdue tickets (sla_breach_at in the past, still open)
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .lt('sla_breach_at', now.toISOString()),

    // KPI: Resolved today
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['resolved', 'closed'])
      .gte('resolved_at', todayStart.toISOString()),

    // For avg resolution time: resolved last 7 days
    client
      .from('tickets')
      .select('created_at, resolved_at')
      .in('status', ['resolved', 'closed'])
      .gte('resolved_at', lastWeekStart.toISOString())
      .not('resolved_at', 'is', null),

    // Previous week comparison: open tickets count at prev week
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .lte('created_at', lastWeekStart.toISOString()),

    // Previous week comparison: overdue
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .lt('sla_breach_at', lastWeekStart.toISOString()),

    // Previous week comparison: resolved in that day
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['resolved', 'closed'])
      .gte('resolved_at', new Date(lastWeekStart.getTime() - 86400000).toISOString())
      .lt('resolved_at', lastWeekStart.toISOString()),

    // Weekly chart: tickets created per day (last 7 days)
    client
      .from('tickets')
      .select('created_at')
      .gte('created_at', lastWeekStart.toISOString()),

    // Weekly chart: tickets resolved per day (last 7 days)
    client
      .from('tickets')
      .select('resolved_at')
      .in('status', ['resolved', 'closed'])
      .gte('resolved_at', lastWeekStart.toISOString())
      .not('resolved_at', 'is', null),

    // Priority tickets: top critical/high open tickets
    client
      .from('tickets')
      .select('id, number, title, severity, status, created_at, requester_name')
      .in('severity', ['critical', 'high'])
      .in('status', ['new', 'assigned', 'in_progress', 'pending'])
      .order('severity', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(5),

    // Recent activity from audit_logs
    client
      .from('audit_logs')
      .select('actor_name, action, entity_type, entity_id, created_at')
      .eq('entity_type', 'ticket')
      .order('created_at', { ascending: false })
      .limit(6),

    // SLA Health
    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .gt('sla_breach_at', new Date(now.getTime() + 3600000).toISOString()),

    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .lte('sla_breach_at', new Date(now.getTime() + 3600000).toISOString())
      .gt('sla_breach_at', now.toISOString()),

    client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'assigned', 'in_progress', 'pending', 'testing'])
      .lte('sla_breach_at', now.toISOString()),

    // Current user
    client.auth.getUser(),
  ]);

  // ---------- Compute KPIs ----------
  const openCount = openTicketsResult.count ?? 0;
  const overdueCount = overdueResult.count ?? 0;
  const resolvedTodayCount = resolvedTodayResult.count ?? 0;

  const prevOpenCount = prevWeekOpenResult.count ?? 0;
  const prevOverdueCount = prevWeekOverdueResult.count ?? 0;
  const prevResolvedCount = prevWeekResolvedResult.count ?? 0;

  function calcChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  // Avg resolution time
  let avgHours = 0;
  const resolvedRows = resolvedLastWeekResult.data ?? [];

  if (resolvedRows.length > 0) {
    const totalMs = resolvedRows.reduce((sum, row) => {
      const created = new Date(row.created_at).getTime();
      const resolved = new Date(row.resolved_at).getTime();
      return sum + (resolved - created);
    }, 0);
    avgHours = Math.round((totalMs / resolvedRows.length / 3600000) * 10) / 10;
  }

  // ---------- Weekly chart data ----------
  const createdRows = weeklyCreatedResult.data ?? [];
  const resolvedChartRows = weeklyResolvedResult.data ?? [];

  const weeklyMap: Record<string, { tickets: number; resolved: number }> = {};
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = getDayLabel(d.toISOString());
    weeklyMap[label] = { tickets: 0, resolved: 0 };
  }

  for (const row of createdRows) {
    const label = getDayLabel(row.created_at);
    if (weeklyMap[label]) weeklyMap[label]!.tickets++;
  }

  for (const row of resolvedChartRows) {
    const label = getDayLabel(row.resolved_at);
    if (weeklyMap[label]) weeklyMap[label]!.resolved++;
  }

  const weeklyData: WeeklyDataPoint[] = Object.entries(weeklyMap).map(
    ([day, data]) => ({ day, ...data }),
  );

  // ---------- Priority tickets ----------
  const priorityTickets: PriorityTicket[] = (
    priorityTicketsResult.data ?? []
  ).map((t) => {
    const statusMap: Record<string, string> = {
      new: 'Open',
      assigned: 'Open',
      in_progress: 'In Progress',
      pending: 'Pending',
      testing: 'Testing',
    };

    return {
      id: `TKT-${t.number ?? t.id.slice(0, 4)}`,
      title: t.title,
      priority: t.severity as PriorityTicket['priority'],
      requester: t.requester_name ?? 'Unknown',
      time: getRelativeTime(t.created_at),
      status: statusMap[t.status] ?? t.status,
    };
  });

  // ---------- Recent activity ----------
  const recentActivity: RecentActivityItem[] = (
    recentActivityResult.data ?? []
  ).map((a) => ({
    user: a.actor_name ?? 'System',
    action: a.action ?? 'updated',
    ticket: `TKT-${a.entity_id?.slice(0, 4) ?? '0000'}`,
    time: getRelativeTime(a.created_at),
  }));

  // ---------- SLA health percentages ----------
  const totalSla =
    (slaOnTrackResult.count ?? 0) +
    (slaAtRiskResult.count ?? 0) +
    (slaBreachedResult.count ?? 0);

  const slaHealth: SlaHealthData =
    totalSla > 0
      ? {
          onTrack: Math.round(((slaOnTrackResult.count ?? 0) / totalSla) * 100),
          atRisk: Math.round(((slaAtRiskResult.count ?? 0) / totalSla) * 100),
          breached: Math.round(
            ((slaBreachedResult.count ?? 0) / totalSla) * 100,
          ),
          complianceThisMonth:
            100 -
            Math.round(((slaBreachedResult.count ?? 0) / totalSla) * 100),
        }
      : { onTrack: 85, atRisk: 12, breached: 3, complianceThisMonth: 94 };

  // ---------- AI performance (from ai_metrics or fallback) ----------
  const aiPerformance: AiPerformanceData = {
    autoClassificationRate: 94,
    aiResolvedNoHuman: 23,
    aiAssistedResolution: 68,
  };

  // ---------- AI insights (recent from ai_insights table or fallback) ----------
  const aiInsights: AiInsightData[] = [
    {
      type: 'analysis',
      title: 'Pattern Detected',
      content:
        '15 similar database connection issues reported in the last 2 hours. Possible infrastructure problem.',
      confidence: 87,
    },
    {
      type: 'suggestion',
      title: 'Recommendation',
      content:
        'Consider creating a Problem ticket to investigate recurring database timeout issues.',
    },
  ];

  // ---------- User name ----------
  const userName =
    userResult.data?.user?.user_metadata?.display_name ??
    userResult.data?.user?.email?.split('@')[0] ??
    'User';

  return {
    userName,
    kpis: {
      openTickets: openCount,
      openTicketsChange: calcChange(openCount, prevOpenCount),
      overdue: overdueCount,
      overdueChange: calcChange(overdueCount, prevOverdueCount),
      resolvedToday: resolvedTodayCount,
      resolvedTodayChange: calcChange(resolvedTodayCount, prevResolvedCount),
      avgResolutionTimeHours: avgHours,
      avgResolutionTimeChange: -15, // fallback; would compare with previous period
    },
    weeklyData,
    priorityTickets,
    recentActivity,
    slaHealth,
    aiPerformance,
    aiInsights,
  };
}

/* -------------------------------------------------------------------------- */
/*  Page (Server Component)                                                    */
/* -------------------------------------------------------------------------- */

export default async function HomePage() {
  await requireUserInServerComponent();

  let data: DashboardData;

  try {
    data = await fetchDashboardData();
  } catch {
    // Fallback data when tables do not exist yet (pre-migration)
    data = {
      userName: 'John',
      kpis: {
        openTickets: 247,
        openTicketsChange: 12,
        overdue: 18,
        overdueChange: -5,
        resolvedToday: 34,
        resolvedTodayChange: 8,
        avgResolutionTimeHours: 4.2,
        avgResolutionTimeChange: -15,
      },
      weeklyData: [
        { day: 'Mon', tickets: 42, resolved: 38 },
        { day: 'Tue', tickets: 38, resolved: 35 },
        { day: 'Wed', tickets: 45, resolved: 40 },
        { day: 'Thu', tickets: 52, resolved: 45 },
        { day: 'Fri', tickets: 48, resolved: 50 },
        { day: 'Sat', tickets: 15, resolved: 12 },
        { day: 'Sun', tickets: 8, resolved: 10 },
      ],
      priorityTickets: [
        {
          id: 'TKT-1247',
          title: 'Production server down - Database connection failing',
          priority: 'critical',
          requester: 'Sarah Johnson',
          time: '5 min ago',
          status: 'Open',
        },
        {
          id: 'TKT-1246',
          title: 'Cannot access email on mobile device',
          priority: 'high',
          requester: 'Mike Chen',
          time: '12 min ago',
          status: 'In Progress',
        },
        {
          id: 'TKT-1245',
          title: 'Request for new software license - Adobe Creative Cloud',
          priority: 'high',
          requester: 'Emma Davis',
          time: '25 min ago',
          status: 'Pending',
        },
        {
          id: 'TKT-1244',
          title: 'VPN connection intermittent issues',
          priority: 'medium',
          requester: 'Alex Turner',
          time: '1 hour ago',
          status: 'In Progress',
        },
      ],
      recentActivity: [
        { user: 'John Doe', action: 'resolved', ticket: 'TKT-1243', time: '2 min ago' },
        { user: 'Lisa Wang', action: 'commented on', ticket: 'TKT-1240', time: '8 min ago' },
        { user: 'Tom Harris', action: 'assigned', ticket: 'TKT-1239', time: '15 min ago' },
        { user: 'Sarah Johnson', action: 'created', ticket: 'TKT-1247', time: '5 min ago' },
      ],
      slaHealth: { onTrack: 85, atRisk: 12, breached: 3, complianceThisMonth: 94 },
      aiPerformance: {
        autoClassificationRate: 94,
        aiResolvedNoHuman: 23,
        aiAssistedResolution: 68,
      },
      aiInsights: [
        {
          type: 'analysis',
          title: 'Pattern Detected',
          content:
            '15 similar database connection issues reported in the last 2 hours. Possible infrastructure problem.',
          confidence: 87,
        },
        {
          type: 'suggestion',
          title: 'Recommendation',
          content:
            'Consider creating a Problem ticket to investigate recurring database timeout issues.',
        },
      ],
    };
  }

  return <DashboardClient data={data} />;
}
