'use client';

// ---------------------------------------------------------------------------
// Tablero del ciclo — un carril por fase del contrato
// ---------------------------------------------------------------------------
// Lo que el PM usa a diario: arrastra una tarjeta y el reloj cambia de dueño
// solo. Al soltarla se llama setPhase(), el trigger de 00077 cierra el tramo
// anterior con sus días hábiles y abre el nuevo — nadie apunta nada aparte.
//
// Tres cosas que la tarjeta tiene que decir de un vistazo:
//
//   1. DE QUIÉN es el tiempo. El borde azul es nuestro, el violeta del
//      cliente, el rojo que nuestro plazo ya se pasó.
//   2. CUÁNTO FALTA del grupo. "5 de 7 listos" explica por qué un entregable
//      sigue abierto aunque casi todo esté hecho.
//   3. CUÁNTO EXPONE en pesos, cuando el atraso es imputable a TDX.
//
// EL RELOJ NO SE REPARTE. Toda tarjeta es un ticket y se arrastra, porque un
// entregable puede repartirse entre dos desarrolladores y cada uno mueve lo
// suyo. Pero el plazo del Anexo C es POR ENTREGABLE: si el ticket está dentro
// de un grupo, el reloj lo lleva el padre y la tarjeta del miembro no pinta
// semáforo ni pesos. Suelto, lo lleva él mismo.
//
// Arrastrar usa la API nativa de HTML5 en vez de una librería: son 7 carriles
// y una lista corta, y una dependencia más para esto no se paga sola.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  Loader2,
  CornerDownRight,
  Rows3,
  Rows4,
  Ticket,
  Users,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

import {
  listCycleItemsAction,
  listOpenWaitsAction,
  setPhaseAction,
} from '~/lib/actions/delivery';

import { CardPanel } from './card-panel';

type Row = Record<string, unknown>;

/** Los carriles del tablero. Las terminales no son etapas de trabajo. */
const CARRILES = [
  { fase: 'levantamiento', nombre: 'Levantamiento', owner: 'cliente' },
  { fase: 'documentacion', nombre: 'Documentación', owner: 'tdx' },
  { fase: 'accesos', nombre: 'Accesos', owner: 'cliente' },
  { fase: 'desarrollo', nombre: 'Desarrollo', owner: 'tdx' },
  { fase: 'uat', nombre: 'UAT', owner: 'cliente' },
  { fase: 'despliegue', nombre: 'Despliegue', owner: 'ninguno' },
  { fase: 'entregado', nombre: 'Entregado', owner: 'ninguno' },
] as const;

type Fase = (typeof CARRILES)[number]['fase'] | 'propuesto' | 'descartado';

const OWNER_COLOR: Record<string, string> = {
  tdx: 'bg-sky-700',
  cliente: 'bg-violet-500',
  ninguno: 'bg-slate-400',
};

const OWNER_LABEL: Record<string, string> = {
  tdx: 'TDX',
  cliente: 'Cliente',
  tercero: 'Tercero',
  ninguno: '—',
};

const cop = (n: unknown) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(n));

interface Props {
  cycleId: string | null;
  cycleStatus: Record<string, unknown> | null;
  organizationId: string | null;
  cycleClosed: boolean;
}

export function CycleBoard(props: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const [waits, setWaits] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  // Azure Boards llama a esto "vista condensada" y muestra solo el ID y el
  // título. Compacto por defecto: con 8 entregables y títulos de 150
  // caracteres, el modo completo no deja ver una columna entera.
  const [densidad, setDensidad] = useState<'compacta' | 'completa'>('compacta');
  // Azure Boards no elige entre jerarquía y lista: la hace conmutable, y los
  // swimlanes con "Group by: Parent" ponen cada grupo en su propia banda.
  // Por requerimiento viene por defecto porque conserva el contexto del
  // contrato — con un clic se ven las 21 sueltas.
  //
  // No hay modo "por módulo": custom_fields->>'modulo' está vacío en 17 de
  // los 21 tickets del ciclo, así que daría un carril y un cajón de sastre.
  const [agrupar, setAgrupar] = useState<'ninguna' | 'requerimiento'>('requerimiento');
  const [plegados, setPlegados] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    if (!props.cycleId) return;
    setCargando(true);
    setError(null);

    const [i, w] = await Promise.all([
      listCycleItemsAction(props.cycleId),
      listOpenWaitsAction({ organization_id: props.organizationId }),
    ]);

    const fallos = [i.error, w.error].filter(Boolean);
    if (fallos.length) setError(fallos.join(' · '));

    setItems((i.data as Row[]) ?? []);
    setWaits((w.data as Row[]) ?? []);
    setCargando(false);
  }, [props.cycleId, props.organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Las esperas abiertas de cada entregable, para pintar el estado. */
  const esperaDe = useMemo(() => {
    const m: Record<string, Row> = {};
    for (const w of waits) {
      const id = String(w.ticket_id);
      if (!m[id] || Number(w.waiting_days) > Number(m[id]!.waiting_days)) m[id] = w;
    }
    return m;
  }, [waits]);

  /** Reparte una lista de tickets en los 7 carriles, más los que no tienen fase. */
  const repartir = useCallback((lista: Row[]) => {
    const m: Record<string, Row[]> = {};
    for (const c of CARRILES) m[c.fase] = [];
    m.__sin = [];
    for (const it of lista) {
      const f = String(it.requirement_phase ?? '');
      if (m[f]) m[f]!.push(it);
      else m.__sin!.push(it);
    }
    return m;
  }, []);

  /**
   * Las bandas del tablero. En modo "ninguna" hay una sola con los 21
   * tickets; agrupado hay una por entregable más la de los sueltos.
   */
  const bandas = useMemo(() => {
    if (agrupar === 'ninguna') {
      return [{ id: '__todas', titulo: null as string | null, cabecera: null as Row | null, tickets: items }];
    }

    const entregables = items.filter((i) => i.is_deliverable);
    const miembrosDe = new Map<string, Row[]>();
    for (const it of items) {
      if (it.is_deliverable) continue;
      const pid = String(it.parent_id);
      if (!miembrosDe.has(pid)) miembrosDe.set(pid, []);
      miembrosDe.get(pid)!.push(it);
    }

    const conGrupo = entregables
      .filter((e) => (miembrosDe.get(String(e.id)) ?? []).length > 0)
      .map((e) => ({
        id: String(e.id),
        titulo: String(e.title),
        cabecera: e,
        // El padre va en la banda como una tarjeta más: es él quien lleva
        // el reloj, así que tiene que verse en su carril.
        tickets: [e, ...(miembrosDe.get(String(e.id)) ?? [])],
      }));

    const sueltos = entregables.filter(
      (e) => (miembrosDe.get(String(e.id)) ?? []).length === 0,
    );

    return [
      ...conGrupo,
      ...(sueltos.length
        ? [{ id: '__sueltos', titulo: 'Sin agrupar', cabecera: null as Row | null, tickets: sueltos }]
        : []),
    ];
  }, [items, agrupar]);

  /** Los que no tienen fase, de todo el ciclo, para el aviso de arriba. */
  const sinFase = useMemo(() => items.filter((i) => !i.requirement_phase), [items]);

  async function mover(ticketId: string, fase: Fase) {
    setMoviendo(ticketId);
    const r = await setPhaseAction(ticketId, fase as never);
    setMoviendo(null);
    if (r.error) setError(r.error);
    else await cargar();
  }

  if (!props.cycleId) {
    return (
      <Card className="text-muted-foreground p-8 text-center text-sm">
        Elige un ciclo para ver su tablero.
      </Card>
    );
  }

  const st = props.cycleStatus;

  return (
    <div className="space-y-4">
      {/* El resumen que el PM mira al entrar */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Card className="px-3 py-1.5">
          Comprometido <strong className="tabular-nums">{String(st?.committed_points ?? '—')}</strong>
        </Card>
        <Card className="px-3 py-1.5">
          Asignado{' '}
          <strong
            className={`tabular-nums ${st?.over_commitment ? 'text-amber-600' : ''}`}
          >
            {String(st?.assigned_points ?? 0)}
          </strong>
        </Card>
        <Card className="px-3 py-1.5">
          Entregado{' '}
          <strong className="tabular-nums text-emerald-600">
            {String(st?.delivered_points ?? 0)}
          </strong>
        </Card>
        <Card className="px-3 py-1.5">
          {items.length} ticket{items.length === 1 ? '' : 's'}
          <span className="text-muted-foreground">
            {' '}
            · {items.filter((i) => i.is_deliverable).length} entregable
            {items.filter((i) => i.is_deliverable).length === 1 ? '' : 's'}
          </span>
        </Card>
        {waits.length ? (
          <Card className="border-violet-400/50 px-3 py-1.5">
            <Clock className="mr-1 inline h-3 w-3" />
            {waits.length} espera{waits.length === 1 ? '' : 's'} abierta
            {waits.length === 1 ? '' : 's'}
          </Card>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Label htmlFor="agrupar" className="text-muted-foreground text-xs">
            Agrupar
          </Label>
          <Select value={agrupar} onValueChange={(v) => setAgrupar(v as typeof agrupar)}>
            <SelectTrigger id="agrupar" className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="requerimiento" className="text-xs">
                Por requerimiento
              </SelectItem>
              <SelectItem value="ninguna" className="text-xs">
                Ninguna — {items.length} sueltas
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDensidad(densidad === 'compacta' ? 'completa' : 'compacta')}
          title={
            densidad === 'compacta'
              ? 'Mostrar el reloj y los miembros en todas'
              : 'Mostrar solo número y título'
          }
        >
          {densidad === 'compacta' ? (
            <Rows4 className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Rows3 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {densidad === 'compacta' ? 'Expandir todas' : 'Compactar'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void cargar()}
          disabled={cargando}
        >
          {cargando ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Actualizar
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</Card>
      ) : null}

      {/* Sin fase. La distinción importa: un ENTREGABLE sin fase no se está
          midiendo contra el contrato, y eso es un problema. Un MIEMBRO sin
          fase solo está sin clasificar — su plazo lo lleva el padre. */}
      {sinFase.length ? (
        <Card
          className={
            sinFase.some((i) => i.is_deliverable)
              ? 'border-amber-400/50 p-3'
              : 'p-3'
          }
        >
          <p className="mb-2 text-sm font-medium">
            {sinFase.some((i) => i.is_deliverable) ? (
              <>
                <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
                {sinFase.filter((i) => i.is_deliverable).length} entregable(s) sin fase — su
                plazo no se está midiendo
                {sinFase.some((i) => !i.is_deliverable)
                  ? `, y ${sinFase.filter((i) => !i.is_deliverable).length} ticket(s) de un grupo sin clasificar`
                  : ''}
              </>
            ) : (
              <>
                {sinFase.length} ticket(s) de un grupo sin clasificar — el plazo lo lleva su
                entregable, pero sin fase no se pueden repartir ni seguir
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {sinFase.map((it) => (
              <div
                key={String(it.id)}
                className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
              >
                {it.is_deliverable ? null : (
                  <span className="text-muted-foreground max-w-32 truncate text-[10px]">
                    ↳ {String(it.parent_title ?? '')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAbierta(String(it.id))}
                  className="max-w-56 truncate text-left hover:underline"
                >
                  {String(it.title)}
                </button>
                <Select
                  onValueChange={(v) => void mover(String(it.id), v as Fase)}
                  disabled={props.cycleClosed || moviendo === String(it.id)}
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue placeholder="Asignar fase" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRILES.map((c) => (
                      <SelectItem key={c.fase} value={c.fase} className="text-xs">
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* El tablero. Una banda por requerimiento, o una sola con todas. */}
      <div className="space-y-3">
        {bandas.length === 0 ? (
          <Card className="text-muted-foreground p-8 text-center text-sm">
            Este ciclo no tiene tickets asignados.
          </Card>
        ) : null}

        {bandas.map((banda) => {
          const plegada = plegados.has(banda.id);
          const d = (banda.cabecera?.delay ?? {}) as Record<string, number>;
          const expuestoBanda = Number(d.exposed_over ?? 0);

          return (
            <div key={banda.id}>
              {/* La cabecera de la banda lleva el crédito y el avance del
                  ENTREGABLE, porque es suyo el plazo, no de cada ticket. */}
              {banda.titulo ? (
                <button
                  type="button"
                  onClick={() =>
                    setPlegados((p) => {
                      const n = new Set(p);
                      if (n.has(banda.id)) n.delete(banda.id);
                      else n.add(banda.id);
                      return n;
                    })
                  }
                  className="hover:bg-muted/50 mb-1.5 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs"
                >
                  {plegada ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {banda.cabecera ? (
                    <Layers className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-semibold">{banda.titulo}</span>
                  {banda.cabecera ? (
                    <>
                      <Badge variant="outline" className="text-[9px]">
                        {String(banda.cabecera.effort_size ?? '—')} ·{' '}
                        {String(banda.cabecera.effort_points ?? 0)}cr
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        <Users className="mr-0.5 inline h-2.5 w-2.5" />
                        {String(banda.cabecera.members_done ?? 0)}/
                        {String(banda.cabecera.member_count ?? 0)}
                      </Badge>
                      {expuestoBanda > 0 ? (
                        <Badge variant="destructive" className="text-[9px]">
                          +{expuestoBanda}d · {cop(expuestoBanda * 790714.29)}
                        </Badge>
                      ) : null}
                    </>
                  ) : null}
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {banda.tickets.length} tkt
                  </span>
                </button>
              ) : null}

              {plegada ? null : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {CARRILES.map((carril) => {
                    const reparto = repartir(banda.tickets);
                    const enCarril = reparto[carril.fase] ?? [];
                    const zona = `${banda.id}:${carril.fase}`;
                    return (
                      <div
                        key={carril.fase}
                        className={`flex w-60 shrink-0 flex-col rounded-md border ${
                          sobre === zona ? 'border-primary bg-primary/5' : 'bg-card'
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setSobre(zona);
                        }}
                        onDragLeave={() => setSobre(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setSobre(null);
                          const id = arrastrando ?? e.dataTransfer.getData('text/plain');
                          if (id) void mover(id, carril.fase);
                          setArrastrando(null);
                        }}
                      >
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                          <i className={`h-2 w-2 rounded-full ${OWNER_COLOR[carril.owner]}`} />
                          <h3 className="flex-1 truncate text-xs font-semibold">
                            {carril.nombre}
                          </h3>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {enCarril.length}
                          </span>
                          <Badge variant="outline" className="text-[9px]">
                            {OWNER_LABEL[carril.owner]}
                          </Badge>
                        </div>

                        <div
                          className={`flex flex-col gap-2 p-2 ${
                            banda.titulo ? 'min-h-20' : 'min-h-36'
                          }`}
                        >
                          {enCarril.length === 0 ? (
                            <p className="text-muted-foreground py-4 text-center text-[11px] italic">
                              —
                            </p>
                          ) : (
                            enCarril.map((it) => (
                              <Tarjeta
                                key={String(it.id)}
                                item={it}
                                espera={esperaDe[String(it.id)]}
                                moviendo={moviendo === String(it.id)}
                                bloqueado={props.cycleClosed}
                                densidad={densidad}
                                // Dentro de una banda el padre ya está en la
                                // cabecera: repetir la miga sería ruido.
                                mostrarPadre={agrupar === 'ninguna'}
                                onAbrir={() => setAbierta(String(it.id))}
                                onDragStart={() => setArrastrando(String(it.id))}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* El panel lateral: se gestiona el requerimiento como un ticket
          —checklist, comentarios, menciones— sin salir del tablero. */}
      {abierta ? (
        <CardPanel
          ticketId={abierta}
          hermanos={items.map((i) => ({ id: String(i.id), title: String(i.title) }))}
          bloqueado={props.cycleClosed}
          onCerrar={() => setAbierta(null)}
          onIr={setAbierta}
          onCambio={() => void cargar()}
        />
      ) : null}

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3 text-violet-500" />
          agrupa varios tickets
        </span>
        <span className="flex items-center gap-1">
          <Ticket className="h-3 w-3" />
          un solo ticket
        </span>
        <span>·</span>
        Arrastra una tarjeta a otro carril para cambiar su fase. El tramo anterior se
        cierra con sus días hábiles y empieza el nuevo, con su propio responsable.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tarjeta({
  item,
  espera,
  moviendo,
  bloqueado,
  densidad,
  mostrarPadre,
  onAbrir,
  onDragStart,
}: {
  item: Row;
  espera: Row | undefined;
  moviendo: boolean;
  bloqueado: boolean;
  /** 'compacta' muestra solo número y título; 'completa' añade el reloj. */
  densidad: 'compacta' | 'completa';
  /** La miga de pan. Falsa dentro de una banda: el padre ya está arriba. */
  mostrarPadre: boolean;
  onAbrir: () => void;
  onDragStart: () => void;
}) {
  // Cada tarjeta recuerda si el PM la expandió, aunque el tablero esté en
  // modo compacto: en una reunión se sigue una o dos de cerca y el resto
  // estorba.
  const [expandida, setExpandida] = useState(false);
  const abierta = densidad === 'completa' || expandida;

  const d = (item.delay ?? {}) as Record<string, number>;
  const expuesto = Number(d.exposed_over ?? 0);
  const tdx = Number(d.tdx_days ?? 0);
  const cli = Number(d.cliente_days ?? 0);
  const total = tdx + cli + Number(d.tercero_days ?? 0);
  const miembros = (item.members ?? []) as Row[];
  const listos = Number(item.members_done ?? 0);
  const esGrupo = miembros.length > 0;
  // El plazo del Anexo C es por entregable. Un miembro tiene fase y
  // responsable, pero su tarjeta no pinta semáforo ni pesos: su reloj lo
  // lleva el padre, y pintarlo aquí haría parecer que hay dos.
  const esMiembro = item.is_deliverable === false;

  const borde = esMiembro
    ? 'border-l-2 border-l-muted-foreground/30'
    : expuesto > 0
      ? 'border-destructive bg-destructive/5'
      : espera
        ? 'border-l-4 border-l-violet-500'
        : esGrupo
          ? 'border-l-4 border-l-violet-400/70'
          : '';

  return (
    <div
      draggable={!bloqueado && !moviendo}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.id));
        onDragStart();
      }}
      className={`rounded border bg-background text-xs ${borde} ${
        bloqueado ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Identidad y taxonomía, siempre visibles: el número es cómo el
          equipo se refiere a las cosas en la reunión, y el icono dice de un
          vistazo si la tarjeta agrupa varios tickets o es uno solo. */}
      <div className="flex items-start gap-1.5 p-2 pb-1">
        {esMiembro ? (
          <CornerDownRight
            className="text-muted-foreground/60 mt-0.5 h-3 w-3 shrink-0"
            aria-label="Parte de un entregable"
          />
        ) : esGrupo ? (
          <Layers
            className="mt-0.5 h-3 w-3 shrink-0 text-violet-500"
            aria-label="Agrupa varios tickets"
          />
        ) : (
          <Ticket
            className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0"
            aria-label="Un solo ticket"
          />
        )}

        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 text-left">
          {/* Sin esto, 21 tarjetas sueltas son una sopa: hay que poder leer
              a qué entregable pertenece cada una. */}
          {esMiembro && mostrarPadre ? (
            <p
              className="text-muted-foreground/80 mb-0.5 truncate text-[9px] leading-none"
              title={String(item.parent_title ?? '')}
            >
              ↳ {String(item.parent_title ?? '')}
            </p>
          ) : null}
          <p className="text-muted-foreground font-mono text-[9px] leading-none">
            {String(item.ticket_number ?? '')}
          </p>
          {/* Dos líneas y corta: un título de 150 caracteres ocupaba seis.
              El texto completo está en el panel. */}
          <p className="mt-1 line-clamp-2 font-medium leading-snug" title={String(item.title)}>
            {String(item.title)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setExpandida(!expandida)}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
          aria-label={abierta ? 'Colapsar' : 'Expandir'}
          aria-expanded={abierta}
        >
          {abierta ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* La fila de señales: cabe en compacto porque es una sola línea. */}
      <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
        {/* El crédito es del entregable. En un miembro, "0cr" se leería como
            si no valiera nada, cuando lo que pasa es que su valor está
            contado arriba. */}
        {esMiembro ? null : item.effort_size ? (
          <Badge variant="outline" className="text-[9px]">
            {String(item.effort_size)} · {String(item.effort_points ?? 0)}cr
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px]">
            sin estimar
          </Badge>
        )}
        {/* Quién lo lleva: es lo que hace falta para repartir un entregable
            entre dos desarrolladores. */}
        {item.assignee_name ? (
          <Badge variant="secondary" className="max-w-28 truncate text-[9px]" title={String(item.assignee_name)}>
            {String(item.assignee_name)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground text-[9px]">
            sin responsable
          </Badge>
        )}
        {esGrupo ? (
          <Badge
            variant={listos === miembros.length ? 'secondary' : 'outline'}
            className="text-[9px]"
          >
            <Users className="mr-0.5 inline h-2.5 w-2.5" />
            {listos}/{miembros.length}
          </Badge>
        ) : null}
        {expuesto > 0 && !esMiembro ? (
          <Badge variant="destructive" className="text-[9px]">
            +{expuesto}d
          </Badge>
        ) : null}
        {espera ? (
          <Badge variant="outline" className="border-violet-400 text-[9px]">
            {String(espera.waiting_days)}d en espera
          </Badge>
        ) : null}
      </div>

      {/* Lo que solo se ve al expandir */}
      {abierta ? (
        <div className="border-t px-2 py-1.5">
          {esMiembro ? (
            <p className="text-muted-foreground text-[9px] leading-snug">
              El plazo lo lleva el entregable
              {item.parent_title ? ` «${String(item.parent_title)}»` : ''}.
            </p>
          ) : total > 0 ? (
            <>
              <div className="bg-muted flex h-1 overflow-hidden rounded">
                {cli > 0 ? (
                  <div className="bg-violet-500" style={{ width: `${(cli / total) * 100}%` }} />
                ) : null}
                {tdx > 0 ? (
                  <div className="bg-sky-700" style={{ width: `${(tdx / total) * 100}%` }} />
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-[9px]">
                {tdx}d TDX · {cli}d cliente
                {expuesto > 0 ? ` · expone ${cop(expuesto * 790714.29)}` : ''}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground font-mono text-[9px]">sin tiempo acumulado</p>
          )}

          {/* Los miembros, para saber qué falta sin abrir el panel */}
          {esGrupo ? (
            <div className="mt-1.5 space-y-0.5">
              {miembros.slice(0, 4).map((m) => (
                <div
                  key={String(m.member_id)}
                  className="text-muted-foreground flex items-center gap-1 text-[9px]"
                >
                  <span className={m.member_done ? 'text-emerald-600' : ''}>
                    {m.member_done ? '✓' : '○'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{String(m.member_title)}</span>
                </div>
              ))}
              {miembros.length > 4 ? (
                <p className="text-muted-foreground text-[9px]">
                  y {miembros.length - 4} más…
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {moviendo ? (
        <p className="text-muted-foreground px-2 pb-1.5 text-[10px]">
          <Loader2 className="mr-1 inline h-2.5 w-2.5 animate-spin" />
          moviendo…
        </p>
      ) : null}
    </div>
  );
}
