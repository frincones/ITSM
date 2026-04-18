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

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-emerald-700 text-left text-white">
                <th className="flex items-center gap-2 border border-emerald-800 px-4 py-3 font-semibold">
                  <FileSpreadsheet className="h-4 w-4" />
                  Reporte Gestión Soporte
                </th>
                <th className="border border-emerald-800 px-4 py-3 text-right font-semibold">
                  Fecha: {formatDate(reportDate)}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, idx) => (
                <tr
                  key={row.key}
                  className={idx % 2 === 0 ? 'bg-emerald-50/50' : 'bg-white'}
                >
                  <td className="border border-emerald-100 px-4 py-2.5 font-semibold text-slate-800">
                    {row.label}
                  </td>
                  <td className="border border-emerald-100 px-4 py-2.5 text-center font-semibold text-slate-900">
                    {metrics[row.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <strong>Nota:</strong> las métricas de &quot;Nuevos Testing&quot; se
        calculan de tickets en estado <code>testing</code> por categoría.
        &quot;Fracaso Testing&quot; y &quot;Pendientes Testing&quot; se leen del
        campo personalizado <code>testing_result</code> del ticket. Si tu equipo
        aún no está marcando ese campo, estos dos contadores pueden aparecer en
        cero.
      </p>
    </div>
  );
}
