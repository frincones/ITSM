'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';

import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileWarning,
  Gauge,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@kit/ui/button';

import { closeCycle } from '~/lib/actions/cycle-closure';
import {
  CREDIT_SCALE,
  formatCompliance,
  type CycleReport,
} from '~/lib/services/cycle-report.service';

/**
 * The monthly service report of contract clause 7.
 *
 * Design rule throughout: never show a ratio without its denominator, and never
 * render "no data" as a zero. A client with no contract, a quiet cycle and a
 * cycle with perfect compliance must all look different — collapsing them into
 * "100%" or "0" is how a number nobody owes ends up in front of the client.
 */

interface Props {
  report: CycleReport | null;
  daily: Array<{ date: string; opened: number; closed: number }>;
  /** Contracted clients to choose from, when none was selected. */
  options: Array<{ id: string; name: string; plan: string }>;
  isClient?: boolean;
  /** Only admins may freeze a cycle — it settles money. */
  canClose?: boolean;
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  });

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <header className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-gray-500">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

export function CycleReportClient({
  report,
  daily,
  options,
  isClient = false,
  canClose = false,
}: Props) {
  const [closing, startClosing] = useTransition();
  const [closeError, setCloseError] = useState<string | null>(null);
  // ---- No client selected: offer the contracted ones ----
  if (!report) {
    if (options.length > 0) {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="mb-1 text-lg font-semibold">
            Reporte mensual de servicio
          </h1>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Elige el cliente. Solo aparecen los que tienen contrato de soporte —
            para los demás este reporte no aplica.
          </p>
          <ul className="space-y-2">
            {options.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/home/reports/ciclo?org=${o.id}`}
                  className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <span>{o.name}</span>
                  <span className="text-xs text-gray-500">{o.plan}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // No contract in force. Explicitly not an empty report: zeroes here would
    // read like flawless service on a client we owe no SLA at all.
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
          <FileWarning className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          <h1 className="mb-1 text-base font-semibold">
            Este cliente no tiene contrato de soporte
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sin contrato vigente no hay cupo, ni SLA, ni créditos que reportar.
            El reporte mensual de la cláusula 7 aplica únicamente a clientes con
            contrato.
          </p>
        </div>
      </div>
    );
  }

  const { usage, compliance, reclassifications, terminationRisk, band } =
    report;

  const overQuota = (usage?.overage ?? 0) > 0;
  const nearQuota = !overQuota && (usage?.pct_used ?? 0) >= 80;
  const maxDaily = Math.max(1, ...daily.map((d) => Math.max(d.opened, d.closed)));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* ---- Header ---- */}
      <header>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Reporte mensual de servicio — {report.organizationName}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Plan {report.planName} · Ciclo {usage?.cycle_label ?? '—'}
          {usage?.is_closed ? (
            <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              ciclo cerrado
            </span>
          ) : (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              ciclo en curso
            </span>
          )}
        </p>
      </header>

      {/* ---- Termination risk: first, because it is the one that ends the contract ---- */}
      {terminationRisk?.at_risk && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
              Causal de terminación configurada (cláusula 10)
            </h2>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            {terminationRisk.below_70_consecutive} ciclo(s) consecutivo(s) y{' '}
            {terminationRisk.below_70_total} en el semestre por debajo del 70%.
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {terminationRisk.detail}
          </p>
        </div>
      )}

      {/* ---- 1. Consumption vs quota ---- */}
      <Section
        icon={<Gauge className="h-4 w-4" />}
        title="Consumo frente al cupo"
        subtitle="Cláusula 6 — el cupo es capacidad reservada; los no consumidos no se acumulan"
      >
        {usage ? (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {usage.consumed}
              </span>
              <span className="text-sm text-gray-500">
                de {usage.quota} tickets ({usage.pct_used}%)
              </span>
            </div>

            <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={
                  overQuota
                    ? 'h-full bg-red-500'
                    : nearQuota
                      ? 'h-full bg-amber-500'
                      : 'h-full bg-emerald-500'
                }
                style={{ width: `${Math.min(usage.pct_used, 100)}%` }}
              />
            </div>

            {/* Only shown when non-zero: the arithmetic matters exactly when the
                report disagrees with the client's own ticket count. */}
            {usage.quota_carried !== 0 && (
              <p className="mb-3 rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-800 dark:bg-blue-500/10 dark:text-blue-300">
                {usage.consumed} consumidos{' '}
                {usage.quota_carried > 0
                  ? `− ${usage.quota_carried} de crédito arrastrado`
                  : `+ ${Math.abs(usage.quota_carried)} de ciclos cerrados`}{' '}
                = <strong>{usage.consumed_net}</strong> netos. Corresponde a
                reclasificaciones de tickets cuyo ciclo ya había cerrado
                (cláusula 2).
              </p>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">Restantes</dt>
                <dd className="tabular-nums">{usage.remaining}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Excedentes</dt>
                <dd className="tabular-nums">{usage.overage}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">
                  Valor de excedentes (+ IVA)
                </dt>
                <dd className="tabular-nums">{cop(usage.overage_cop)}</dd>
              </div>
            </dl>

            {nearQuota && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                Se alcanzó el 80% del cupo — la cláusula 6 obliga a avisar al
                cliente.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">Sin datos del ciclo.</p>
        )}
      </Section>

      {/* ---- Capacity band ---- */}
      {band && (
        <Section
          icon={<TrendingUp className="h-4 w-4" />}
          title="Banda de capacidad"
          subtitle={`Cláusula 6 — plan ${band.plan_name}, banda ${band.band_low}–${band.band_high} tickets`}
        >
          <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Desciende con</dt>
              <dd className="tabular-nums">
                {band.descend_at !== null
                  ? `${band.descend_at} o menos`
                  : 'No aplica'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Asciende con</dt>
              <dd className="tabular-nums">
                {band.ascend_at !== null
                  ? `${band.ascend_at} o más`
                  : 'No aplica'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Ciclos cerrados vistos</dt>
              <dd className="tabular-nums">{band.cycles_considered}</dd>
            </div>
          </dl>

          {band.adjustment_due ? (
            <div
              className={
                band.direction === 'descenso'
                  ? 'rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10'
                  : 'rounded-md border border-blue-300 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-500/10'
              }
            >
              <p className="text-sm font-medium">
                Ajuste de plan exigible: {band.direction} a {band.target_plan}
                {band.effective_from && ` desde el ${band.effective_from}`}
              </p>
              {band.target_fee_cop !== null && (
                <p className="mt-1 text-sm">
                  Valor mensual del plan {band.target_plan}:{' '}
                  {cop(band.target_fee_cop)}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {band.detail}
              </p>
              {/* The clause says the adjustment is automatic and then that the
                  client confirms it in writing. The system reports; it does not
                  switch the plan. */}
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                El cambio requiere confirmación escrita del cliente
                (cláusula 6). El sistema no modifica el plan.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {band.detail}
            </p>
          )}

          {band.cycles_considered === 0 && (
            <p className="mt-2 text-xs text-gray-500">
              La banda se evalúa solo sobre ciclos cerrados — un ciclo en curso
              todavía puede entrar o salir de la banda.
            </p>
          )}
        </Section>
      )}

      {/* ---- 2. SLA compliance and credits ---- */}
      <Section
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Cumplimiento de niveles de servicio"
        subtitle="Cláusula 4 — mide tiempo de RESPUESTA, no de resolución, con el reloj en horario hábil"
      >
        {compliance ? (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatCompliance(compliance)}
              </span>
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">Dentro de SLA</dt>
                <dd className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  {compliance.met}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Fuera de SLA</dt>
                <dd className="tabular-nums text-red-700 dark:text-red-400">
                  {compliance.breached}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">En plazo</dt>
                <dd className="tabular-nums">{compliance.pending}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Sin SLA</dt>
                <dd className="tabular-nums">{compliance.excluded_count}</dd>
              </div>
            </dl>

            {/* The "sin SLA" bucket is the one most likely to be misread, so it
                gets said in words rather than left as a number. */}
            {compliance.excluded_count > 0 && (
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {compliance.excluded_count} ticket(s) quedan fuera del cálculo
                por clasificación (garantía, evolutivo o terceros). No cuentan
                como cumplidos ni como incumplidos.
              </p>
            )}

            {/* ---- Credits ---- */}
            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Crédito de servicio (cláusula 5)
                </h3>
                <span
                  className={
                    compliance.credit_tickets > 0
                      ? 'text-sm font-semibold text-red-700 dark:text-red-400'
                      : 'text-sm font-semibold text-emerald-700 dark:text-emerald-400'
                  }
                >
                  {compliance.credit_tickets > 0
                    ? `${compliance.credit_tickets} ticket(s) · ${cop(compliance.credit_cop)}`
                    : 'Sin crédito'}
                </span>
              </div>

              <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                {compliance.credit_basis}
              </p>

              {compliance.credit_suppressed && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                  Crédito suprimido por el piso de volumen pactado.
                </p>
              )}

              {!usage?.is_closed && compliance.credit_tickets > 0 && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                  Proyección — el ciclo aún no cierra y el número puede cambiar.
                </p>
              )}

              <table className="w-full text-xs">
                <tbody className="text-gray-600 dark:text-gray-400">
                  {CREDIT_SCALE.map((s) => {
                    const active =
                      compliance.compliance_pct !== null &&
                      compliance.credit_tickets === s.credit &&
                      !compliance.credit_suppressed;
                    return (
                      <tr
                        key={s.range}
                        className={
                          active
                            ? 'font-semibold text-gray-900 dark:text-gray-100'
                            : ''
                        }
                      >
                        <td className="py-0.5">{s.range}</td>
                        <td className="py-0.5 text-right">{s.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Sin datos del ciclo.</p>
        )}
      </Section>

      {/* ---- 3. Daily activity ---- */}
      <Section
        icon={<CalendarRange className="h-4 w-4" />}
        title="Tickets por día"
        subtitle="Abiertos y cerrados dentro del ciclo, desde el historial de estados"
      >
        {daily.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-1">
              {daily.map((d) => (
                <div key={d.date} className="w-8 text-center">
                  <div className="flex h-24 flex-col justify-end gap-0.5">
                    <div
                      className="rounded-t bg-blue-500"
                      style={{ height: `${(d.opened / maxDaily) * 45}%` }}
                      title={`${d.opened} abiertos`}
                    />
                    <div
                      className="rounded-t bg-emerald-500"
                      style={{ height: `${(d.closed / maxDaily) * 45}%` }}
                      title={`${d.closed} cerrados`}
                    />
                  </div>
                  <span className="block text-[10px] text-gray-500">
                    {shortDate(d.date)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-blue-500" />
                Abiertos
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-emerald-500" />
                Cerrados
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Sin movimiento en el ciclo.</p>
        )}
      </Section>

      {/* ---- 4. Reclassifications ---- */}
      <Section
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="Reclasificaciones del período"
        subtitle="Cláusula 2 — reclasificar un ticket de soporte restituye el cupo"
      >
        {reclassifications.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-1 text-left">Ticket</th>
                  <th className="px-2 py-1 text-left">De</th>
                  <th className="px-2 py-1 text-left">A</th>
                  <th className="px-2 py-1 text-left">Efecto en cupo</th>
                  <th className="px-2 py-1 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {reclassifications.map((r) => (
                  <tr
                    key={`${r.ticket_id}-${r.changed_at}`}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="px-2 py-1">
                      <Link
                        href={`/home/tickets/${r.ticket_id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {r.ticket_number}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-gray-600 dark:text-gray-400">
                      {r.from_type}
                    </td>
                    <td className="px-2 py-1">{r.to_type}</td>
                    <td className="px-2 py-1">
                      <span
                        className={
                          r.quota_effect === 'restituye'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : r.quota_effect === 'consume'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-gray-500'
                        }
                      >
                        {r.quota_effect}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-xs text-gray-500">
                      {new Date(r.changed_at).toLocaleDateString('es-CO', {
                        timeZone: 'America/Bogota',
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Sin reclasificaciones en el ciclo.
          </p>
        )}
      </Section>

      {/* ---- 5. Root causes ---- */}
      <Section
        icon={<FileWarning className="h-4 w-4" />}
        title="Causas raíz y recomendaciones"
        subtitle="Cláusula 7 — pendiente de instrumentar"
      >
        <p className="text-sm text-gray-500">
          Esta sección todavía se redacta manualmente. La cláusula 7 la exige
          junto con las anteriores, así que hay que adjuntarla al entregable.
        </p>
      </Section>

      {/* ---- Close the cycle ---- */}
      {canClose && usage && !usage.is_closed && compliance?.is_closed && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800">
          <h2 className="mb-1 text-sm font-semibold">Cerrar el ciclo</h2>
          <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
            El ciclo terminó el {usage.cycle_end}. Al cerrarlo, estas cifras
            quedan congeladas y el reporte deja de recalcularlas — es el punto en
            que los números dejan de ser negociables. Una reclasificación
            posterior se convierte en crédito de cupo del ciclo siguiente, no
            modifica este (cláusula 2).
          </p>

          {closeError && (
            <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
              {closeError}
            </p>
          )}

          <Button
            size="sm"
            disabled={closing}
            onClick={() => {
              setCloseError(null);
              startClosing(async () => {
                const res = await closeCycle(report.contractId, usage.cycle_start);
                if (res.error) setCloseError(res.error);
              });
            }}
          >
            {closing ? 'Cerrando…' : 'Cerrar y congelar cifras'}
          </Button>
        </div>
      )}

      {!isClient && (
        <p className="text-xs text-gray-400">
          El cálculo mide tiempo de respuesta con el reloj en horario hábil
          (L-V 8:00–17:00 Colombia, sin festivos) y descuenta las pausas
          atribuibles al cliente, conforme a la cláusula 4.
        </p>
      )}
    </div>
  );
}
