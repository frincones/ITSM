'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  AlertCircle,
  ArrowUpCircle,
  Download,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { cn } from '@kit/ui/utils';

import type { TicketSummary } from '../../page';

interface Metrics {
  cerradosGarantia: number;
  cerradosSoporte: number;
  nuevoGarantia: number;
  nuevoSoporte: number;
  progresoGarantia: number;
  progresoSoporte: number;
  testingGarantia: number;
  testingSoporte: number;
  pendientesGarantia: number;
  pendientesSoporte: number;
  fracasoTesting: number;
  pendientesTesting: number;
}

type TicketLists = Record<keyof Metrics, TicketSummary[]>;

interface Props {
  reportDate: string;
  organizationName: string;
  metrics: Metrics;
  lists: TicketLists;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const ROWS: Array<{ label: string; key: keyof Metrics }> = [
  { label: 'Casos Cerrados Garantía:', key: 'cerradosGarantia' },
  { label: 'Casos Cerrados Soporte:', key: 'cerradosSoporte' },
  { label: 'Casos Nuevo Garantía:', key: 'nuevoGarantia' },
  { label: 'Casos Nuevo Soporte:', key: 'nuevoSoporte' },
  { label: 'Casos en Progreso Garantía:', key: 'progresoGarantia' },
  { label: 'Casos en Progreso Soporte:', key: 'progresoSoporte' },
  { label: 'Nuevos Testing Garantía:', key: 'testingGarantia' },
  { label: 'Nuevos Testing Soporte:', key: 'testingSoporte' },
  { label: 'Pendientes Garantía:', key: 'pendientesGarantia' },
  { label: 'Pendientes Soporte:', key: 'pendientesSoporte' },
  { label: 'Casos Fracaso Testing:', key: 'fracasoTesting' },
  { label: 'Casos Pendientes Testing:', key: 'pendientesTesting' },
];

const STATUS_LABEL: Record<string, string> = {
  new: 'Nuevo',
  backlog: 'Backlog',
  assigned: 'Asignado',
  in_progress: 'En Progreso',
  pending: 'Pendiente',
  detenido: 'Detenido',
  testing: 'Testing',
  resolved: 'Resuelto',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

const STATUS_CLASSES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  backlog: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  in_progress: 'bg-orange-100 text-orange-700 border-orange-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  detenido: 'bg-amber-100 text-amber-800 border-amber-300',
  testing: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

function urgencyIcon(urgency: string) {
  if (urgency === 'critical')
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (urgency === 'high')
    return <ArrowUpCircle className="h-3.5 w-3.5 text-orange-500" />;
  return null;
}

export function GestionSoporteClient({
  reportDate,
  organizationName,
  metrics,
  lists,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleDateChange = (newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleExport = () => {
    const lines: string[] = [];
    lines.push('Reporte Gestión Soporte');
    lines.push(`Fecha:,${formatDate(reportDate)}`);
    if (organizationName) lines.push(`Organización:,${organizationName}`);
    lines.push('');

    // ── Summary section ───────────────────────────────────────
    lines.push('Resumen');
    lines.push('Indicador,Cantidad');
    ROWS.forEach((r) => {
      lines.push(`${r.label.replace(/:$/, '')},${metrics[r.key]}`);
    });
    lines.push('');

    // ── Detail section ────────────────────────────────────────
    lines.push('Detalle');
    lines.push('Indicador,Ticket,Título,Estado,Urgencia,Creado');
    ROWS.forEach((r) => {
      const tickets = lists[r.key] ?? [];
      if (tickets.length === 0) return;
      tickets.forEach((t) => {
        const cells = [
          r.label.replace(/:$/, ''),
          t.ticket_number,
          t.title.replace(/"/g, '""'),
          STATUS_LABEL[t.status] ?? t.status,
          t.urgency,
          t.created_at.slice(0, 10),
        ];
        const csvRow = cells
          .map((c) =>
            c.includes(',') || c.includes('"') || c.includes('\n')
              ? `"${c.replace(/"/g, '""')}"`
              : c,
          )
          .join(',');
        lines.push(csvRow);
      });
    });

    const csv = lines.join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte-Gestion-Soporte-${reportDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reporte Gestión Soporte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen y detalle diario
            {organizationName ? ` — ${organizationName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="report-date"
              className="text-sm font-medium text-muted-foreground"
            >
              Fecha:
            </label>
            <Input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={handleExport} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* ── Summary Table ──────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-md border-2 border-slate-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                colSpan={2}
                className="border-2 border-slate-900 bg-emerald-100 px-4 py-3 text-center text-lg font-bold text-slate-900"
              >
                <span className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Reporte Gestión Soporte
                </span>
              </th>
            </tr>
            <tr>
              <th className="w-2/3 border-2 border-slate-900 bg-emerald-100 px-4 py-2 text-center text-base font-bold text-slate-900">
                Fecha:
              </th>
              <th className="border-2 border-slate-900 bg-white px-4 py-2 text-center text-base font-bold text-slate-900">
                {formatDate(reportDate)}
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="border-2 border-slate-900 bg-white px-4 py-2 text-sm font-bold text-slate-900">
                  {row.label}
                </td>
                <td className="border-2 border-slate-900 bg-white px-4 py-2 text-center text-base font-bold text-slate-900 tabular-nums">
                  {metrics[row.key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Detail section ─────────────────────────────────────────────── */}
      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Detalle diario</h2>
          <p className="text-xs text-muted-foreground">
            Tickets individuales agrupados por cada indicador del resumen.
            Click en un ticket para abrirlo.
          </p>
        </header>

        <div className="flex flex-col divide-y divide-border">
          {ROWS.map((row) => {
            const tickets = lists[row.key] ?? [];
            if (tickets.length === 0) return null;
            return <DetailGroup key={row.key} title={row.label} tickets={tickets} />;
          })}
          {Object.values(metrics).every((n) => n === 0) && (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              Sin tickets en ninguna categoría para la fecha seleccionada.
            </div>
          )}
        </div>
      </section>

      {/* ── Notes ──────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-3xl rounded-md bg-muted/30 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong>Notas:</strong>
        </p>
        <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong>Cerrados / Nuevo</strong>: tickets cuyo
            <code className="mx-1">closed_at</code> /
            <code className="mx-1">created_at</code> cae en el día seleccionado.
          </li>
          <li>
            <strong>En Progreso / Pendientes</strong>: snapshot actual por
            estado × tipo.
          </li>
          <li>
            <strong>Nuevos Testing</strong>: tickets que transicionaron a testing
            ese día (campo <code>testing_entered_at</code>, se captura desde el
            deploy del 21-abr-2026 en adelante).
          </li>
          <li>
            <strong>Fracaso / Pendientes Testing</strong>: sub-estado marcado
            por el agente / cliente en el ticket (campo
            <code className="mx-1">testing_result</code>).
          </li>
        </ul>
      </div>
    </div>
  );
}

// ─── Detail group (one row per indicador with tickets listed) ──────────────

interface DetailGroupProps {
  title: string;
  tickets: TicketSummary[];
}

function DetailGroup({ title, tickets }: DetailGroupProps) {
  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {title.replace(/:$/, '')}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {tickets.length} {tickets.length === 1 ? 'caso' : 'casos'}
        </span>
      </div>

      <ul className="divide-y divide-border/60 rounded border border-border/60 bg-background">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link
              href={`/home/tickets/${t.id}`}
              className="group flex h-12 items-center gap-3 px-3 text-sm transition-colors hover:bg-muted/40"
            >
              <span className="flex w-4 shrink-0 items-center justify-center">
                {urgencyIcon(t.urgency)}
              </span>
              <span className="w-[120px] shrink-0 font-mono text-[11px] text-muted-foreground">
                {t.ticket_number}
              </span>
              <span className="flex-1 truncate text-sm">{t.title}</span>
              <span
                className={cn(
                  'h-6 shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium leading-5',
                  STATUS_CLASSES[t.status] ?? STATUS_CLASSES.new,
                )}
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
