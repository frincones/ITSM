'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Download, FileSpreadsheet } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Card, CardContent } from '@kit/ui/card';

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

interface Props {
  reportDate: string;
  organizationName: string;
  metrics: Metrics;
}

function formatDate(iso: string): string {
  // iso = YYYY-MM-DD → DD/MM/YYYY
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

export function GestionSoporteClient({
  reportDate,
  organizationName,
  metrics,
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
    ROWS.forEach((r) => {
      lines.push(`${r.label.replace(/:$/, '')},${metrics[r.key]}`);
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reporte Gestión Soporte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen de casos por estado y categoría
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

      <div className="mx-auto w-full max-w-xl rounded-md bg-muted/30 p-3">
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
            estado × categoría.
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
