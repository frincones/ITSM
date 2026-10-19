'use client';

// ---------------------------------------------------------------------------
// Portal del cliente — avance por fases y esperas
// ---------------------------------------------------------------------------
// Dos secciones, en este orden a propósito:
//
//   1. LO QUE ESPERAMOS DE USTED, arriba, porque es lo único que el cliente
//      puede resolver al entrar. Si lo primero que ve es nuestro atraso, la
//      pantalla se vuelve un reproche; si ve lo suyo primero, se vuelve una
//      lista de tareas.
//
//   2. El avance de cada requerimiento, con el reparto de días. Incluye
//      nuestro atraso cuando existe, reconocido sin rodeos: esconderlo
//      mientras se muestra el del cliente sería deshonesto, y el equipo pidió
//      explícitamente lo contrario.
//
// El ancho de las barras es tiempo real. Si el tramo del cliente ocupa más
// que el nuestro, es porque duró más — eso es toda la conversación que esta
// pantalla pretende cerrar.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { formatHabil, formatHabilDoble, formatHabilLargo } from '~/lib/format/business-time';

export interface PhaseSpan {
  phase: string;
  owner: string;
  is_open: boolean;
  business_minutes: number | null;
  paused_minutes: number;
  net_minutes: number | null;
  target_minutes: number | null;
  over_minutes: number | null;
  breached: boolean | null;
}

export interface PhaseRequirement {
  id: string;
  ticket_number: string;
  title: string;
  phase: string | null;
  effort_size: string | null;
  effort_points: number | null;
  tdx_minutes: number;
  client_minutes: number;
  third_party_minutes: number;
  tdx_over: number;
  client_over: number;
  spans: PhaseSpan[];
}

export interface PhaseWait {
  wait_id: string;
  ticket_number: string;
  ticket_title: string;
  phase: string;
  what: string;
  owed_by: string;
  waiting_minutes: number;
  target_minutes: number | null;
  over_minutes: number | null;
  turn_number: number;
}

export interface PhaseMember {
  requirement_id: string;
  member_number: string;
  member_title: string;
  member_status: string;
  member_done: boolean;
}

export interface PhaseSummary {
  open_requirements: number;
  tdx_delay_minutes: number;
  client_delay_minutes: number;
  third_party_minutes: number;
  open_waits: number;
  oldest_wait_minutes: number;
}

interface Props {
  requirements: PhaseRequirement[];
  waits: PhaseWait[];
  summary: PhaseSummary;
  phaseCatalog: Array<{ phase: string; name: string; owner: string; sort_order: number }>;
  /** Los tickets que componen cada requerimiento agrupado, por id del padre. */
  members: Record<string, PhaseMember[]>;
}

/** Nombre corto de cada fase. El catálogo trae el canónico; esto cabe en una fila. */
const FASE_CORTA: Record<string, string> = {
  propuesto: 'Propuesto',
  levantamiento: 'Levantamiento',
  aprobacion: 'Aprobación',
  documentacion: 'Documentación',
  accesos: 'Accesos',
  desarrollo: 'Desarrollo',
  uat: 'Tus pruebas',
  despliegue: 'Producción',
  entregado: 'Entregado',
  descartado: 'Descartado',
};

/** Fases que se dibujan en la línea de avance. Las terminales no son etapas. */
/**
 * De quién depende que una fase avance. Es lo único que el cliente necesita
 * saber de un vistazo: si le toca a él o lo tenemos nosotros.
 *
 * Sale del mismo catálogo que usa el cálculo (delivery_phases.owner), pero se
 * escribe aquí en los términos del cliente: «tú» y «nosotros», no «cliente» y
 * «tdx».
 */
const DEPENDE: Record<string, 'tu' | 'nosotros' | 'nadie'> = {
  propuesto: 'nadie',
  levantamiento: 'nosotros',
  documentacion: 'nosotros',
  aprobacion: 'tu',
  accesos: 'tu',
  desarrollo: 'nosotros',
  uat: 'tu',
  despliegue: 'nosotros',
};

const LINEA = [
  'propuesto',
  'levantamiento',
  'documentacion',
  'aprobacion',
  'accesos',
  'desarrollo',
  'uat',
  'despliegue',
] as const;

export function PortalPhases(props: Props) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const nombreFase = useMemo(() => {
    const m: Record<string, string> = { ...FASE_CORTA };
    for (const p of props.phaseCatalog) {
      // El catálogo manda si trae un nombre; FASE_CORTA es el respaldo.
      if (!m[p.phase]) m[p.phase] = p.name;
    }
    return m;
  }, [props.phaseCatalog]);

  const vivos = props.requirements.filter(
    (r) => r.phase !== null && !['entregado', 'descartado'].includes(r.phase),
  );
  const entregados = props.requirements.filter((r) => r.phase === 'entregado');

  // Nuestras esperas se separan de las del cliente: son dos listas con dos
  // acciones distintas, y mezclarlas difumina de quién es cada cosa.
  const suyas = props.waits.filter((w) => w.owed_by !== 'tdx');
  const nuestras = props.waits.filter((w) => w.owed_by === 'tdx');

  if (props.requirements.length === 0) return null;

  return (
    <>
      {/* ── 1. Lo que esperamos de usted ── */}
      {suyas.length > 0 ? (
        <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-6 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Lo que esperamos de ti</h2>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {formatHabilLargo(props.summary.client_delay_minutes)} acumuladas
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Mientras esperamos, el plazo de entrega se extiende hora por hora.
          </p>

          <ul className="mt-4 space-y-2">
            {suyas.map((w) => (
              <li
                key={w.wait_id}
                className="flex flex-wrap items-start gap-3 rounded-lg border bg-white p-3 dark:bg-gray-900"
              >
                <div className="min-w-12 text-center">
                  <p
                    className={`text-xl font-bold tabular-nums ${
                      (w.over_minutes ?? 0) > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-violet-700 dark:text-violet-300'
                    }`}
                  >
                    {formatHabil(w.waiting_minutes)}
                  </p>
                  <p className="text-[10px] uppercase text-gray-500">hábiles</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{w.what}</p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {w.ticket_number} · {w.ticket_title}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {nombreFase[w.phase] ?? w.phase}
                    </span>
                    {w.target_minutes !== null ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        plazo {formatHabil(w.target_minutes)}
                      </span>
                    ) : null}
                    {w.turn_number > 1 ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        ronda {w.turn_number}
                      </span>
                    ) : null}
                    {(w.over_minutes ?? 0) > 0 ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        +{formatHabil(w.over_minutes)} sobre el plazo
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Lo que debemos nosotros, cuando lo hay ── */}
      {nuestras.length > 0 ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm dark:bg-gray-900">
          <h2 className="font-medium">En qué estamos trabajando</h2>
          <ul className="mt-3 space-y-2">
            {nuestras.map((w) => (
              <li
                key={w.wait_id}
                className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
              >
                <div className="min-w-12 text-center">
                  <p className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">
                    {formatHabil(w.waiting_minutes)}
                  </p>
                  <p className="text-[10px] uppercase text-gray-500">hábiles</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{w.what}</p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {w.ticket_number} · a cargo de TDX
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 2. El avance de cada requerimiento ── */}
      <section className="rounded-xl border bg-white p-6 shadow-sm dark:bg-gray-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Avance de tus requerimientos</h2>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {vivos.length} en curso
            {entregados.length ? ` · ${entregados.length} entregado(s)` : ''}
          </span>
        </div>

        {/* La leyenda va arriba: sin ella las barras son decoración. */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-700" />
            Tiempo de TDX
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />
            Tiempo tuyo
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-400" />
            Terceros
          </span>
        </div>

        <ul className="mt-4 space-y-3">
          {[...vivos, ...entregados].map((r) => (
            <RequirementRow
              key={r.id}
              req={r}
              miembros={props.members[r.id] ?? []}
              nombreFase={nombreFase}
              expandido={abierto === r.id}
              onToggle={() => setAbierto(abierto === r.id ? null : r.id)}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function RequirementRow({
  req,
  miembros,
  nombreFase,
  expandido,
  onToggle,
}: {
  req: PhaseRequirement;
  /** Los tickets que el cliente creó y que componen este entregable. */
  miembros: PhaseMember[];
  nombreFase: Record<string, string>;
  expandido: boolean;
  onToggle: () => void;
}) {
  const listos = miembros.filter((m) => m.member_done).length;
  const total = req.tdx_minutes + req.client_minutes + req.third_party_minutes;
  const terminal = ['entregado', 'descartado'].includes(req.phase ?? '');
  const idxActual = LINEA.indexOf((req.phase ?? '') as (typeof LINEA)[number]);
  const depende = DEPENDE[req.phase ?? ''] ?? 'nadie';

  return (
    <li className="rounded-lg border p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-baseline gap-2 text-left"
        aria-expanded={expandido}
      >
        <span className="font-mono text-xs text-gray-500">{req.ticket_number}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{req.title}</span>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            terminal
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
          }`}
        >
          {nombreFase[req.phase ?? ''] ?? req.phase}
        </span>
        {miembros.length > 0 ? (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {listos} de {miembros.length} listos
          </span>
        ) : null}
        {req.effort_points ? (
          <span className="text-[11px] text-gray-500">
            {req.effort_size} · {req.effort_points} cr
          </span>
        ) : null}
      </button>

      {/* ------------------------------------------------------------------
          La línea de avance.

          Antes eran ocho etiquetas de 9px, una por fase, y había que leerlas
          todas para saber dónde estaba. Ahora la barra se lee de un vistazo
          —verde lo hecho, el tramo grueso dónde va— y debajo, en una frase,
          DE QUIÉN DEPENDE, que es lo único que el cliente puede accionar.

          El color del tramo actual dice de quién es: ámbar si le toca a él,
          azul si lo tenemos nosotros.
          ------------------------------------------------------------------ */}
      {!terminal && idxActual >= 0 ? (
        <div className="mt-3">
          <div className="flex gap-1">
            {LINEA.map((f, i) => (
              <div
                key={f}
                className={`h-1.5 flex-1 rounded-full ${
                  i < idxActual
                    ? 'bg-emerald-500'
                    : i === idxActual
                      ? depende === 'tu'
                        ? 'bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-900'
                        : 'bg-sky-600 ring-2 ring-sky-200 dark:ring-sky-900'
                      : 'bg-gray-200 dark:bg-gray-700'
                }`}
                title={nombreFase[f] ?? f}
              />
            ))}
          </div>

          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] text-gray-400">
            <span>Inicio</span>
            <span
              className={`font-medium ${
                depende === 'tu'
                  ? 'text-amber-700 dark:text-amber-400'
                  : depende === 'nosotros'
                    ? 'text-sky-700 dark:text-sky-400'
                    : 'text-gray-500'
              }`}
            >
              {nombreFase[req.phase ?? ''] ?? req.phase}
            </span>
            <span>Producción</span>
          </div>

          {/* La frase que resume todo: quién tiene la pelota. */}
          <p
            className={`mt-2 text-xs font-medium ${
              depende === 'tu'
                ? 'text-amber-700 dark:text-amber-400'
                : depende === 'nosotros'
                  ? 'text-sky-700 dark:text-sky-400'
                  : 'text-gray-500'
            }`}
          >
            {depende === 'tu'
              ? `→ te toca a ti${
                  req.client_minutes > 0 ? ` · ${formatHabil(req.client_minutes)} esperando` : ''
                }`
              : depende === 'nosotros'
                ? `→ estamos en ello${
                    req.tdx_minutes > 0 ? ` · ${formatHabil(req.tdx_minutes)}` : ''
                  }`
                : '→ aún no empieza'}
          </p>
        </div>
      ) : null}

      {/* El reparto de días. Con total 0 no se dibuja: una barra repartida a
          partes iguales insinuaría días que no existieron. */}
      {total > 0 ? (
        <div className="mt-2.5">
          <div className="flex h-5 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
            {req.client_minutes > 0 ? (
              <div
                className="flex items-center justify-center bg-violet-500 text-[10px] font-medium text-white"
                style={{ width: `${(req.client_minutes / total) * 100}%` }}
                title={`${formatHabil(req.client_minutes)} de espera tuya`}
              >
                {req.client_minutes / total > 0.22 ? `${formatHabil(req.client_minutes)} de espera tuya` : ''}
              </div>
            ) : null}
            {req.third_party_minutes > 0 ? (
              <div
                className="flex items-center justify-center bg-gray-400 text-[10px] font-medium text-white"
                style={{ width: `${(req.third_party_minutes / total) * 100}%` }}
                title={`${formatHabil(req.third_party_minutes)} de terceros`}
              >
                {req.third_party_minutes / total > 0.22 ? `${formatHabil(req.third_party_minutes)} 3ros` : ''}
              </div>
            ) : null}
            {req.tdx_minutes > 0 ? (
              <div
                className="flex items-center justify-center bg-sky-700 text-[10px] font-medium text-white"
                style={{ width: `${(req.tdx_minutes / total) * 100}%` }}
                title={`${formatHabil(req.tdx_minutes)} de TDX`}
              >
                {req.tdx_minutes / total > 0.22 ? `${formatHabil(req.tdx_minutes)} TDX` : ''}
              </div>
            ) : null}
          </div>

          {/* Una frase por parte, en renglones distintos. Juntas decían
              «Llevamos 2 días de atraso. Las 8 minutos que esperamos tu
              respuesta extienden el plazo», que mezcla nuestro
              incumplimiento con su espera y no se entiende. */}
          <div className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed">
            {req.tdx_over > 0 ? (
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Nos pasamos {formatHabilLargo(req.tdx_over)} del plazo en este requerimiento.
              </p>
            ) : (
              <p className="text-emerald-700 dark:text-emerald-400">
                Sin atraso de nuestra parte.
              </p>
            )}
            {req.client_over > 0 ? (
              <p className="text-gray-600 dark:text-gray-400">
                Llevas {formatHabilLargo(req.client_over)} por encima de tu plazo de respuesta,
                y eso extiende el nuestro.
              </p>
            ) : req.client_minutes > 0 ? (
              <p className="text-gray-600 dark:text-gray-400">
                Esperando tu respuesta desde hace {formatHabilLargo(req.client_minutes)}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Los tickets que componen el entregable. El cliente los creó y
          quiere ver en qué van, aunque el plazo sea del requerimiento. */}
      {expandido && miembros.length > 0 ? (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400">
            Este requerimiento agrupa {miembros.length} solicitudes tuyas
          </p>
          <ul className="space-y-1">
            {miembros.map((m) => (
              <li key={m.member_number} className="flex items-center gap-2 text-[11px]">
                <span className={m.member_done ? 'text-emerald-600' : 'text-gray-400'}>
                  {m.member_done ? '✓' : '○'}
                </span>
                <span className="font-mono text-[10px] text-gray-500">{m.member_number}</span>
                <span className="min-w-0 flex-1 truncate">{m.member_title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-gray-500">
            El plazo se mide sobre el requerimiento completo, no sobre cada solicitud.
          </p>
        </div>
      ) : null}

      {/* El detalle por fase, al desplegar: para quien quiera auditar la
          cifra en vez de creérsela. */}
      {expandido && req.spans.length > 0 ? (
        <div className="mt-3 overflow-x-auto border-t pt-3">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-1 pr-3 font-medium">Fase</th>
                <th className="pb-1 pr-3 font-medium">A cargo</th>
                <th className="pb-1 pr-3 text-right font-medium">Tiempo</th>
                <th className="pb-1 pr-3 text-right font-medium">En espera</th>
                <th className="pb-1 pr-3 text-right font-medium">Netos</th>
                <th className="pb-1 text-right font-medium">Plazo</th>
              </tr>
            </thead>
            <tbody>
              {req.spans.map((s, i) => (
                <tr key={`${s.phase}-${i}`} className="border-t">
                  <td className="py-1 pr-3">
                    {nombreFase[s.phase] ?? s.phase}
                    {s.is_open ? ' (en curso)' : ''}
                  </td>
                  <td className="py-1 pr-3">
                    {s.owner === 'tdx' ? 'TDX' : s.owner === 'cliente' ? 'Tú' : s.owner === 'tercero' ? 'Tercero' : '—'}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {formatHabil(s.business_minutes)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {s.paused_minutes > 0 ? `−${formatHabil(s.paused_minutes)}` : '—'}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums font-medium">
                    {formatHabilDoble(s.net_minutes)}
                  </td>
                  <td
                    className={`py-1 text-right tabular-nums ${
                      s.breached ? 'font-medium text-amber-700 dark:text-amber-400' : ''
                    }`}
                  >
                    {s.target_minutes === null ? 'sin plazo' : formatHabil(s.target_minutes)}
                    {(s.over_minutes ?? 0) > 0 ? ` (+${formatHabil(s.over_minutes)})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-500">
            El tiempo en espera se descuenta del plazo de TDX, según el acuerdo de
            niveles de servicio.
          </p>
        </div>
      ) : null}
    </li>
  );
}
