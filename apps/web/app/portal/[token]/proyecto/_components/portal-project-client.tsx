'use client';

// ---------------------------------------------------------------------------
// Portal del cliente — vista de su proyecto
// ---------------------------------------------------------------------------
// Tres bloques: el medidor del ciclo, los ciclos de entrega y el backlog.
//
// Dos criterios que gobiernan toda la pantalla:
//
// 1. No mezclar escalas. El medidor cuenta TICKETS contra el cupo del
//    contrato; el backlog pesa en PUNTOS de esfuerzo. Son dos medidas de dos
//    cosas distintas, y presentarlas juntas haría creer que 30 créditos y 40
//    puntos son comparables.
//
// 2. Decir la verdad cuando no hay dato. Prosuministros no tiene contrato de
//    soporte: el medidor lo dice en vez de mostrar "0 de 0", que parecería un
//    cupo agotado.
// ---------------------------------------------------------------------------


import { AlertTriangle, CalendarCheck } from 'lucide-react';

interface Meter {
  quota: number | null;
  consumed: number | null;
  remaining: number | null;
  overage: number | null;
  pct_used: number | null;
  cycle_label: string | null;
}

interface Item {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  effort_points: number | null;
  effort_size: string | null;
  cycle_number: number | null;
  created_at: string;
}

interface Cycle {
  id: string;
  cycle_number: number;
  name: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  committed_points: number | null;
  delivered_points: number | null;
  assigned_points: number;
  items_total: number;
}

export interface PortalProjectClientProps {
  orgName: string;
  orgColors: { primary?: string; accent?: string } | null;
  userName: string | null;
  meter: Meter;
  items: Item[];
  totals: Record<string, number>;
  cycles: Cycle[];
  /** Requerimientos con fase y el reparto de días por responsable. */
  requirements: PhaseRequirement[];
  waits: PhaseWait[];
  summary: PhaseSummary;
  phaseCatalog: Array<{ phase: string; name: string; owner: string; sort_order: number }>;
  /** Los tickets que componen cada requerimiento agrupado. */
  members: Record<string, PhaseMember[]>;
}

import {
  PortalPhases,
  type PhaseMember,
  type PhaseRequirement,
  type PhaseSummary,
  type PhaseWait,
} from './portal-phases';


export function PortalProjectClient(props: PortalProjectClientProps) {
  const primary = props.orgColors?.primary ?? '#4f46e5';

  const m = props.meter;
  const tieneContrato = m.quota !== null;
  const pct = m.pct_used ?? 0;
  const excedido = (m.overage ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Mi proyecto</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {props.orgName}
          {props.userName ? ` · ${props.userName}` : ''}
        </p>
      </header>

      {/* ---- Medidor del ciclo ---- */}
      <section className="rounded-xl border bg-white p-6 shadow-sm dark:bg-gray-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Consumo de tu ciclo</h2>
          {m.cycle_label ? (
            <span className="text-sm text-gray-500">{m.cycle_label}</span>
          ) : null}
        </div>

        {!tieneContrato ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Todavía no hay un contrato de soporte configurado para tu organización, así
            que no hay cupo que mostrar. Si crees que debería haberlo, escríbenos desde
            el chat.
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-gray-500">Contratados</div>
                <div className="mt-1 text-3xl font-semibold">{m.quota}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Consumidos</div>
                <div className="mt-1 text-3xl font-semibold">{m.consumed}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Disponibles</div>
                <div
                  className={`mt-1 text-3xl font-semibold ${
                    excedido ? 'text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {m.remaining}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    backgroundColor: excedido ? '#d97706' : primary,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>{pct}% del ciclo usado</span>
                {excedido ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {m.overage} por encima del cupo
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              El cupo cuenta las solicitudes de soporte del ciclo. Las correcciones en
              garantía no consumen cupo.
            </p>
          </>
        )}
      </section>

      {/* ---- Ciclos de entrega ---- */}
      {props.cycles.length ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm dark:bg-gray-900">
          <h2 className="font-medium">Ciclos de entrega</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Lo que el equipo se compromete a entregar en cada periodo. Se mide en
            puntos de esfuerzo, una escala distinta del cupo de arriba.
          </p>

          <div className="mt-4 space-y-3">
            {props.cycles.map((c) => {
              const cerrado = c.status === 'closed';
              const base = c.committed_points ?? 0;
              const avance = base
                ? Math.round(((c.delivered_points ?? 0) / base) * 100)
                : 0;
              return (
                <div key={c.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      Ciclo {c.cycle_number}
                      {c.name ? ` · ${c.name}` : ''}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <CalendarCheck className="h-3.5 w-3.5" />
                      {c.starts_on} → {c.ends_on}
                      {cerrado ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                          cerrado
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-6 text-sm">
                    <span>
                      <span className="text-gray-500">Comprometido: </span>
                      {c.committed_points ?? '—'}
                    </span>
                    <span>
                      <span className="text-gray-500">Planificado: </span>
                      {c.assigned_points}
                    </span>
                    <span>
                      <span className="text-gray-500">Entregado: </span>
                      {c.delivered_points ?? 0}
                    </span>
                    <span>
                      <span className="text-gray-500">Items: </span>
                      {c.items_total}
                    </span>
                  </div>

                  {base ? (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(avance, 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ---- Fases y esperas (Anexo C) ----
           Va antes del backlog porque "lo que esperamos de ti" es lo único
           que el cliente puede resolver al entrar. */}
      <PortalPhases
        orgName={props.orgName}
        requirements={props.requirements}
        waits={props.waits}
        summary={props.summary}
        phaseCatalog={props.phaseCatalog}
        members={props.members}
      />

      {/* ---- Backlog ----
           OCULTO a propósito. Son 46 ítems registrados, la mayoría sin
           estimar ni comprometer, y encima de la lista de avance hacían que
           el cliente no supiera qué mirar. Lo que sí le sirve está arriba:
           lo que espera su acción y cómo va cada requerimiento del ciclo.

           El código se conserva para cuando el backlog tenga una vista
           propia que valga la pena enseñar. */}
    </div>
  );
}

