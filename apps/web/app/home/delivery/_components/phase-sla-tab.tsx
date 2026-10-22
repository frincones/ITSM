'use client';

// ---------------------------------------------------------------------------
// SLA por fase — la pestaña del Anexo C
// ---------------------------------------------------------------------------
// Tres bloques, en orden de lo que el PM necesita decidir:
//
//   1. Las cifras del ciclo: cumplimiento contra el umbral y la exposición
//   2. Las esperas abiertas, con el botón "ya llegó"   <- lo accionable
//   3. Los requerimientos, con el atraso de cada parte
//
// El criterio que gobierna la pantalla: SIEMPRE se muestra de quién es cada
// minuto de atraso. Un ítem con 19 h de espera del cliente y 2 nuestras no es
// "21 h tarde": son dos conversaciones distintas, y mezclarlas es cómo se
// acaba discutiendo sin datos.
//
// Y la cifra grande es el EXCESO sobre el plazo, no el tiempo en la fase.
// El tiempo en la fase incluye el plazo pactado, así que encabezarlo
// convertía un requerimiento puntual en uno que parecía tarde. Lo consumido
// sigue ahí, de subtítulo. Misma jerarquía que el portal del cliente, a
// propósito: las dos pantallas se abren juntas en reunión y no pueden decir
// cifras distintas de lo mismo.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Clock,
  Loader2,
  TrendingDown,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import { formatHabil } from '~/lib/format/business-time';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

import {
  closeWaitAction,
  deliveryComplianceAction,
  listMembersBulkAction,
  listOpenWaitsAction,
  listRequirementsAction,
  setPhaseAction,
} from '~/lib/actions/delivery';

// ---------------------------------------------------------------------------
// Vocabulario de la pantalla
// ---------------------------------------------------------------------------
// Las etiquetas viven aquí y no en la base porque son de interfaz. El
// catálogo `delivery_phases` tiene el nombre canónico; esto es cómo se
// abrevia en una tabla estrecha.

const FASES = [
  'propuesto',
  'levantamiento',
  'documentacion',
  'aprobacion',
  'accesos',
  'desarrollo',
  'uat',
  'despliegue',
  'entregado',
  'descartado',
] as const;

type Fase = (typeof FASES)[number];

const FASE_LABEL: Record<Fase, string> = {
  propuesto: 'Propuesto',
  levantamiento: 'Levantamiento',
  documentacion: 'Documentación',
  aprobacion: 'Aprobación',
  accesos: 'Accesos',
  desarrollo: 'Desarrollo',
  uat: 'UAT',
  despliegue: 'Despliegue',
  entregado: 'Entregado',
  descartado: 'Descartado',
};

/** De quién es el reloj en cada fase. Igual que el catálogo de 00076. */
const FASE_OWNER: Record<Fase, 'tdx' | 'cliente' | 'ninguno'> = {
  propuesto: 'cliente',
  levantamiento: 'tdx',
  documentacion: 'tdx',
  aprobacion: 'cliente',
  accesos: 'cliente',
  desarrollo: 'tdx',
  uat: 'cliente',
  despliegue: 'ninguno',
  entregado: 'ninguno',
  descartado: 'ninguno',
};

const OWNER_LABEL: Record<string, string> = {
  tdx: 'TDX',
  cliente: 'Cliente',
  tercero: 'Tercero',
  ninguno: '—',
};

/** Los seis motivos de 00048. El último registra la espera sin descontarla. */
const MOTIVOS = [
  { value: 'espera_cliente_info', label: 'Información del cliente' },
  { value: 'espera_cliente_validacion', label: 'Validación o aprobación' },
  { value: 'dependencia_tercero', label: 'Dependencia de un tercero' },
  { value: 'ventana_mantenimiento', label: 'Ventana de mantenimiento' },
  { value: 'fuerza_mayor', label: 'Fuerza mayor' },
  { value: 'priorizacion_interna', label: 'Prioridad interna (no pausa)' },
] as const;

const MOTIVO_LABEL = Object.fromEntries(MOTIVOS.map((m) => [m.value, m.label]));

const cop = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(n));

// ---------------------------------------------------------------------------

interface Cycle {
  id: string;
  cycle_number: number;
  name: string | null;
  status: string;
}

interface Props {
  cycles: Cycle[];
  selectedCycleId: string | null;
  projectId: string | null;
  organizationId: string | null;
  onCycleChange: (id: string) => void;
}

type Compliance = Record<string, unknown> | null;
type Row = Record<string, unknown>;

export function PhaseSlaTab(props: Props) {
  const [compliance, setCompliance] = useState<Compliance>(null);
  const [waits, setWaits] = useState<Row[]>([]);
  const [reqs, setReqs] = useState<Row[]>([]);
  // Los tickets que componen cada requerimiento agrupado. Se piden en bloque
  // para no hacer una consulta por fila.
  const [miembros, setMiembros] = useState<Record<string, Row[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [c, w, r] = await Promise.all([
      props.selectedCycleId
        ? deliveryComplianceAction(props.selectedCycleId)
        : Promise.resolve({ data: null, error: null }),
      listOpenWaitsAction({
        organization_id: props.organizationId,
        project_id: props.projectId,
      }),
      listRequirementsAction({ project_id: props.projectId }),
    ]);

    // Un fallo en una de las tres no debe dejar la pantalla en blanco: se
    // muestra lo que sí llegó y se avisa de lo que no.
    const fallos = [c.error, w.error, r.error].filter(Boolean);
    if (fallos.length) setError(fallos.join(' · '));

    setCompliance((c.data as Compliance) ?? null);
    setWaits((w.data as Row[]) ?? []);
    const filas = (r.data as Row[]) ?? [];
    setReqs(filas);

    if (filas.length) {
      const m = await listMembersBulkAction(filas.map((x) => String(x.id)));
      setMiembros((m.data as unknown as Record<string, Row[]>) ?? {});
    } else {
      setMiembros({});
    }

    setCargando(false);
  }, [props.selectedCycleId, props.organizationId, props.projectId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    let tdx = 0;
    let cliente = 0;
    let tercero = 0;
    // Lo que CADA PARTE se pasó de su plazo. Distinto del tiempo que lleva
    // cada uno: el levantamiento no tiene plazo y no puede incumplir, pero
    // sus horas están dentro de tdx. Confundirlos hacía que la tarjeta
    // dijera «atraso de TDX: 4d» cuando el exceso real era la mitad.
    let atrasoTdx = 0;
    let atrasoCliente = 0;
    let expuesto = 0;
    let expuestos = 0;

    for (const r of reqs) {
      const d = (r.delay ?? {}) as Record<string, number>;
      tdx += Number(d.tdx_minutes ?? 0);
      cliente += Number(d.cliente_minutes ?? 0);
      tercero += Number(d.tercero_minutes ?? 0);
      atrasoTdx += Number(d.tdx_over ?? 0);
      atrasoCliente += Number(d.cliente_over ?? 0);
      expuesto += Number(d.exposed_over ?? 0);
      if (Number(d.exposed_over ?? 0) > 0) expuestos += 1;
    }

    const vivos = reqs.filter(
      (r) => !['entregado', 'descartado'].includes(String(r.requirement_phase)),
    ).length;

    return { tdx, cliente, tercero, atrasoTdx, atrasoCliente, expuesto, expuestos, vivos };
  }, [reqs]);

  const pct = compliance?.delivery_pct as number | null | undefined;
  const bajoUmbral = Boolean(compliance?.below_threshold);
  const descuento = compliance?.discount_cop as number | null | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Label className="text-xs">Ciclo</Label>
          <Select
            value={props.selectedCycleId ?? ''}
            onValueChange={props.onCycleChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Elegir ciclo" />
            </SelectTrigger>
            <SelectContent>
              {props.cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name ?? `Ciclo ${c.cycle_number}`}
                  {c.status === 'closed' ? ' (cerrado)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Actualizar
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error}
        </Card>
      ) : null}

      {/* ── 1. Las cifras del ciclo ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Entregado
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {pct === null || pct === undefined ? '—' : `${pct}%`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {compliance
              ? `${compliance.delivered_credits ?? 0} de ${compliance.committed_credits ?? '—'} créditos`
              : 'Sin ciclo elegido'}
          </p>
          {bajoUmbral ? (
            <Badge variant="destructive" className="mt-2 text-[10px]">
              Bajo el umbral del {String(compliance?.retention_threshold ?? 50)}%
            </Badge>
          ) : null}
        </Card>

        {/* Lo que NOS pasamos del plazo, no lo que llevamos trabajando.
            La tarjeta decía «Atraso de TDX» sobre el tiempo trabajado: 4d
            donde el exceso real eran 2d. El tiempo trabajado baja a
            contexto, que es su sitio. */}
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Nos pasamos
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              resumen.atrasoTdx > 0 ? 'text-destructive' : ''
            }`}
          >
            {resumen.atrasoTdx > 0 ? formatHabil(resumen.atrasoTdx) : '—'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {resumen.atrasoTdx > 0
              ? `de ${formatHabil(resumen.tdx)} trabajados`
              : `${formatHabil(resumen.tdx)} trabajados, todo en plazo`}
          </p>
        </Card>

        {/* Lo que SE pasó el cliente. No se mostraba en ninguna parte, y es
            la cifra que sostiene la conversación: una cosa es cuánto
            llevamos esperando y otra cuánto excede su plazo. */}
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Se pasó el cliente
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              resumen.atrasoCliente > 0 ? 'text-violet-600 dark:text-violet-400' : ''
            }`}
          >
            {resumen.atrasoCliente > 0 ? formatHabil(resumen.atrasoCliente) : '—'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {resumen.atrasoCliente > 0
              ? `de ${formatHabil(resumen.cliente)} esperando su respuesta`
              : `${formatHabil(resumen.cliente)} esperando, dentro de plazo`}
          </p>
          {resumen.tercero > 0 ? (
            <p className="text-muted-foreground mt-2 text-xs">
              +{formatHabil(resumen.tercero)} de terceros
            </p>
          ) : null}
        </Card>

        {/* Lo único que cuesta dinero: el atraso nuestro en fases que generan
            crédito. Separado a propósito de «nos pasamos», porque pasarse en
            documentación no vale lo mismo que pasarse en desarrollo. */}
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Expone
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              resumen.expuesto > 0 ? 'text-destructive' : ''
            }`}
          >
            {descuento !== null && descuento !== undefined && Number(descuento) > 0
              ? cop(descuento)
              : resumen.expuesto > 0
                ? formatHabil(resumen.expuesto)
                : '—'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {resumen.expuesto > 0
              ? `${resumen.expuestos} requerimiento(s) con atraso en desarrollo`
              : descuento === null || descuento === undefined
                ? 'sin plan de entrega vigente'
                : 'ningún atraso en fases que generan crédito'}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Esperas abiertas
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{waits.length}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {waits.length
              ? `la más antigua: ${formatHabil(Number(waits[0]?.waiting_minutes ?? 0))}`
              : 'nada pendiente'}
          </p>
        </Card>
      </div>

      {/* El `basis` que devuelve la función: de dónde sale la cifra, en una
          frase, para que el PM la pueda defender sin abrir el SQL. */}
      {compliance?.basis ? (
        <Card className="bg-muted/40 p-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {String(compliance.basis)}
          </p>
        </Card>
      ) : null}

      {/* ── 2. Las esperas abiertas: lo accionable ── */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4" />
          Esperas abiertas
        </h3>

        {waits.length === 0 ? (
          <Card className="text-muted-foreground p-6 text-center text-sm">
            No hay nada esperando respuesta.
          </Card>
        ) : (
          <div className="space-y-2">
            {waits.map((w) => (
              <WaitRow
                key={String(w.wait_id)}
                wait={w}
                cerrando={cerrando === String(w.wait_id)}
                onCerrar={async (nota, devolver) => {
                  setCerrando(String(w.wait_id));
                  const res = await closeWaitAction({
                    wait_id: String(w.wait_id),
                    note: nota,
                    return_what: devolver,
                  });
                  setCerrando(null);
                  if (res.error) setError(res.error);
                  else await cargar();
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 3. Los requerimientos, con el reparto de días ── */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <TrendingDown className="h-4 w-4" />
          Requerimientos ({resumen.vivos} abiertos
          {resumen.expuestos > 0 ? `, ${resumen.expuestos} exponen descuento` : ''})
        </h3>

        {reqs.length === 0 ? (
          <Card className="text-muted-foreground p-6 text-center text-sm">
            Ningún requerimiento tiene fase asignada todavía. Al asignar una
            fase empieza a medirse su plazo.
          </Card>
        ) : (
          <div className="space-y-2">
            {reqs.map((r) => (
              <ReqRow
                key={String(r.id)}
                req={r}
                miembros={miembros[String(r.id)] ?? []}
                onFase={async (fase) => {
                  const res = await setPhaseAction(String(r.id), fase);
                  if (res.error) setError(res.error);
                  else await cargar();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Una espera abierta
// ---------------------------------------------------------------------------

function WaitRow({
  wait,
  cerrando,
  onCerrar,
}: {
  wait: Row;
  cerrando: boolean;
  onCerrar: (nota: string | null, devolver: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');
  const [devolver, setDevolver] = useState('');

  const dias = Number(wait.waiting_minutes ?? 0);
  const plazo = wait.target_minutes as number | null;
  const sobre = Number(wait.over_minutes ?? 0);
  const pausa = Boolean(wait.pauses_clock);
  const deQuien = String(wait.owed_by);

  return (
    <Card className={`p-3 ${sobre > 0 ? 'border-amber-500/50' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-14 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              sobre > 0 ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          >
            {formatHabil(dias)}
          </p>
          <p className="text-muted-foreground text-[10px] uppercase">en espera</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{String(wait.what)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {String(wait.ticket_number)} · esperando a{' '}
            <strong>{OWNER_LABEL[deQuien] ?? deQuien}</strong>
            {wait.owed_by_name ? ` (${String(wait.owed_by_name)})` : ''} · fase{' '}
            {FASE_LABEL[String(wait.phase) as Fase] ?? String(wait.phase)}
            {Number(wait.turn_number ?? 1) > 1
              ? ` · turno ${String(wait.turn_number)}`
              : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px]">
              {MOTIVO_LABEL[String(wait.reason)] ?? String(wait.reason)}
            </Badge>
            {plazo !== null ? (
              <Badge variant="outline" className="text-[10px]">
                plazo {formatHabil(plazo)}
              </Badge>
            ) : null}
            {!pausa ? (
              <Badge variant="secondary" className="text-[10px]">
                no pausa el reloj
              </Badge>
            ) : null}
            {sobre > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                +{formatHabil(sobre)} sobre el plazo
              </Badge>
            ) : null}
          </div>
        </div>

        {abierto ? null : (
          <Button size="sm" onClick={() => setAbierto(true)} disabled={cerrando}>
            {cerrando ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
            Ya llegó
          </Button>
        )}
      </div>

      {abierto ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div>
            <Label className="text-xs">Qué llegó (opcional)</Label>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Llegaron con 3 observaciones"
            />
          </div>
          <div>
            <Label className="text-xs">
              Abrir el turno de vuelta (opcional)
            </Label>
            <Input
              value={devolver}
              onChange={(e) => setDevolver(e.target.value)}
              placeholder="v2 del documento con los ajustes"
            />
            {/* El ida y vuelta del contrato: al recibir los comentarios, la
                espera pasa a ser nuestra. Escribir aquí cierra la del cliente
                y abre la de TDX en la misma operación. */}
            <p className="text-muted-foreground mt-1 text-[11px]">
              Si lo rellenas, la espera pasa a ser de{' '}
              {deQuien === 'tdx' ? 'el cliente' : 'TDX'}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onCerrar(nota.trim() || null, devolver.trim() || null)}
              disabled={cerrando}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Un requerimiento con su reparto de días
// ---------------------------------------------------------------------------

function ReqRow({
  req,
  miembros,
  onFase,
}: {
  req: Row;
  /** Los tickets que componen este entregable. Vacío si es individual. */
  miembros: Row[];
  onFase: (f: Fase) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const listos = miembros.filter((m) => m.member_done).length;
  const d = (req.delay ?? {}) as Record<string, number | string | null>;
  const tdx = Number(d.tdx_minutes ?? 0);
  const cli = Number(d.cliente_minutes ?? 0);
  const ter = Number(d.tercero_minutes ?? 0);
  // El atraso real de TDX, se cobre o no.
  const atrasoTdx = Number(d.tdx_over ?? 0);
  // El del cliente. No cuesta crédito —ya extendió nuestro plazo— pero sin
  // él la tarjeta solo sabía reprochar hacia dentro: decía las 25 h que
  // esperamos nosotros y callaba las 40 h que esperamos al cliente.
  const atrasoCli = Number(d.cliente_over ?? 0);
  // Lo que además expone crédito: solo cuenta en fases que lo generan
  // (desarrollo). Decir «sin atraso» cuando esto es 0 era mentir: un
  // requerimiento podía llevar 16 h de más en documentación y la pantalla
  // afirmaba que no había atraso imputable.
  const expuesto = Number(d.exposed_over ?? 0);
  const fase = String(req.requirement_phase) as Fase;
  const terminal = ['entregado', 'descartado'].includes(fase);

  // El ancho es tiempo real. Con total 0 no se dibuja nada en vez de
  // repartir a partes iguales, que insinuaría días que no existieron.
  const total = tdx + cli + ter;

  return (
    <Card className={`p-3 ${expuesto > 0 ? 'border-destructive/50' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {String(req.ticket_number)}
            </span>
            <span className="truncate text-sm font-medium">{String(req.title)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge
              variant={terminal ? 'secondary' : 'default'}
              className="text-[10px]"
            >
              {FASE_LABEL[fase] ?? fase}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {OWNER_LABEL[FASE_OWNER[fase] ?? 'ninguno']}
            </Badge>
            {req.effort_size ? (
              <Badge variant="outline" className="text-[10px]">
                {String(req.effort_size)}
                {req.effort_points ? ` · ${String(req.effort_points)} cr` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                sin estimar
              </Badge>
            )}
            {miembros.length > 0 ? (
              <button
                type="button"
                onClick={() => setAbierto(!abierto)}
                className="inline-flex"
                aria-expanded={abierto}
              >
                <Badge
                  variant={listos === miembros.length ? 'secondary' : 'outline'}
                  className="cursor-pointer text-[10px]"
                >
                  {listos} de {miembros.length} listos
                </Badge>
              </button>
            ) : null}
            {expuesto > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                expone crédito
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="w-40">
          <Select value={fase} onValueChange={(v) => onFase(v as Fase)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FASES.map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {FASE_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Los tickets del grupo. Explican por qué el reloj sigue corriendo:
          mientras falte uno, el entregable no está entregado. */}
      {abierto && miembros.length > 0 ? (
        <div className="mt-2 rounded border p-2">
          {miembros.map((m) => (
            <div key={String(m.member_id)} className="flex items-center gap-2 py-0.5 text-xs">
              <span className={m.member_done ? 'text-emerald-600' : 'text-muted-foreground'}>
                {m.member_done ? '✓' : '○'}
              </span>
              <span className="text-muted-foreground font-mono text-[10px]">
                {String(m.member_number)}
              </span>
              <span className="min-w-0 flex-1 truncate">{String(m.member_title)}</span>
              <Badge variant="outline" className="text-[9px]">
                {String(m.member_type)}
              </Badge>
              {m.member_consumes_quota ? (
                <Badge variant="outline" className="text-[9px] text-amber-600">
                  cuota
                </Badge>
              ) : null}
            </div>
          ))}
          <p className="text-muted-foreground mt-1.5 text-[10px]">
            El crédito y el plazo son del requerimiento; sus tickets van en 0.
            Los marcados con «cuota» siguen contando en la cuota de soporte.
          </p>
        </div>
      ) : null}

      {total > 0 ? (
        <div className="mt-2">
          {/* La barra se queda solo por la proporción, que es lo único que
              aporta y las tarjetas no pueden dar. Las cifras salían dentro
              de cada tramo y son las MISMAS que los subtítulos de abajo, a
              dos centímetros: ahora viven una sola vez. La franja es fina y
              sin texto, para leerse de un vistazo y no competir con el
              titular. */}
          <div
            className="bg-muted flex h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`Reparto del tiempo: ${formatHabil(cli)} del cliente, ${formatHabil(tdx)} de TDX`}
          >
            {cli > 0 ? (
              <div
                className="bg-violet-500"
                style={{ width: `${(cli / total) * 100}%` }}
                title={`${formatHabil(cli)} del cliente`}
              />
            ) : null}
            {ter > 0 ? (
              <div
                className="bg-slate-400"
                style={{ width: `${(ter / total) * 100}%` }}
                title={`${formatHabil(ter)} de terceros`}
              />
            ) : null}
            {tdx > 0 ? (
              <div
                className="bg-sky-700"
                style={{ width: `${(tdx / total) * 100}%` }}
                title={`${formatHabil(tdx)} de TDX`}
              />
            ) : null}
          </div>
          {/* ------------------------------------------------------------
              Las dos partes, cada una con su exceso al frente.

              Antes esto era prosa que encabezaba el atraso de TDX y del
              cliente solo decía las horas esperadas, nunca su exceso: la
              tarjeta sabía reprochar hacia dentro y no hacia fuera. Y el
              atraso de TDX salía dos veces, aquí y en la insignia.

              Lo que se pasó del plazo va grande; lo consumido, debajo. Es
              la misma jerarquía que el portal, para que una reunión con la
              pantalla interna y el portal abiertos no muestre dos cifras
              distintas para lo mismo.
              ------------------------------------------------------------ */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded border p-2">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase">
                TDX
              </p>
              {atrasoTdx > 0 ? (
                <>
                  <p className="text-destructive text-base leading-tight font-bold">
                    +{formatHabil(atrasoTdx)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    de atraso · {formatHabil(tdx)} trabajadas
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base leading-tight font-bold">En plazo</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {tdx > 0 ? `${formatHabil(tdx)} trabajadas` : 'sin tiempo'}
                  </p>
                </>
              )}
              {/* El crédito expuesto es un subconjunto del atraso, no otra
                  cifra: solo cuenta en fases que generan descuento. Decir
                  «sin atraso» cuando esto es 0 era mentir. */}
              {atrasoTdx > 0 ? (
                <p className="text-muted-foreground mt-1 text-[10px]">
                  {expuesto > 0
                    ? `${formatHabil(expuesto)} exponen crédito`
                    : 'no expone crédito todavía'}
                </p>
              ) : null}
            </div>

            <div className="rounded border p-2">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase">
                Cliente
              </p>
              {atrasoCli > 0 ? (
                <>
                  <p className="text-base leading-tight font-bold text-amber-600 dark:text-amber-500">
                    +{formatHabil(atrasoCli)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    de atraso · {formatHabil(cli)} esperando
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base leading-tight font-bold">En plazo</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {cli > 0 ? `${formatHabil(cli)} esperando` : 'sin tiempo'}
                  </p>
                </>
              )}
              {cli > 0 ? (
                <p className="text-muted-foreground mt-1 text-[10px]">
                  extiende nuestro plazo
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
