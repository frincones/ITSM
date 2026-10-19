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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  Loader2,
  CornerDownRight,
  ListFilter,
  Rows3,
  Rows4,
  X,
  Ticket,
  Users,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
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
  listCycleItemsAction,
  listOpenWaitsAction,
  setPhaseAction,
} from '~/lib/actions/delivery';

import { CardPanel } from './card-panel';

type Row = Record<string, unknown>;

/**
 * Los carriles del tablero. Las terminales no son etapas de trabajo.
 *
 * `propuesto` va primero y es la única SIN PLAZO: está en el ciclo pero
 * todavía no arranca, y no todos los requerimientos empiezan el primer día.
 * Sin ella, lo que no ha iniciado tenía que ir a «Levantamiento» —que sí
 * tiene plazo, de 2 días— y el reloj del cliente corría por trabajo que nadie
 * había empezado.
 */
const CARRILES = [
  // El dueño es 'cliente' porque así está en delivery_phases, y esta etiqueta
  // tiene que decir lo que dice la base. Pero SIN PLAZO: acumula días y no
  // puede incumplir, que es justo lo que hace falta mientras no arranca.
  { fase: 'propuesto', nombre: 'Por iniciar', owner: 'cliente' },
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

/**
 * Lo que vale un crédito: 11.070.000 ÷ 14 del Anexo C.
 *
 * ⚠ ESTÁ ESCRITO A MANO Y LA BASE NO LO VALIDA. cycle_delivery_compliance
 * devuelve hoy credit_value_cop = null porque billing_plans está vacío, así
 * que estos pesos no los contrasta nadie: si el plan cambia, la pantalla
 * seguiría mostrando la cifra vieja sin avisar.
 *
 * Mientras tanto, al menos vive en un solo sitio. Estaba duplicada en la
 * cabecera de banda y en la tarjeta, y bastaba tocar una para que dejaran
 * de cuadrar entre sí.
 */
const COP_POR_CREDITO = 790714.29;

/**
 * Las dimensiones por las que se puede filtrar.
 *
 * Están elegidas MIDIENDO cuántos valores distintos reparten los tickets del
 * ciclo: un filtro cuyos tickets comparten todos el mismo valor es un control
 * que ocupa sitio y no filtra nada. Por eso no están prioridad, urgencia,
 * impacto ni canal (un solo valor en los 21 del ciclo 1), ni área/categoría
 * (vacía en 19 de 21), ni módulo (listCycleItems ni lo selecciona).
 *
 * Cada una saca sus opciones de los datos cargados, así que si mañana un
 * campo empieza a tener variedad, el filtro aparece solo.
 */
const DIMENSIONES: Array<{
  k: string;
  nombre: string;
  valor: (t: Row) => string | string[] | null;
}> = [
  {
    k: 'release',
    nombre: 'Release',
    // El R vive en el título: «R1 · Capa de filtros». Un miembro hereda el de
    // su entregable, que es a lo que pertenece en el cronograma.
    valor: (t) => {
      const m = /^(R\d)/.exec(String(t.parent_title ?? t.title ?? ''));
      return m ? m[1]! : null;
    },
  },
  { k: 'responsable', nombre: 'Responsable', valor: (t) => (t.assignee_name as string) ?? null },
  {
    k: 'tipo',
    nombre: 'Tipo',
    valor: (t) => (t.is_deliverable === false ? 'Ticket de un grupo' : 'Entregable'),
  },
  { k: 'estado', nombre: 'Estado', valor: (t) => (t.status as string) ?? null },
  {
    k: 'fase',
    nombre: 'Fase',
    valor: (t) =>
      t.requirement_phase
        ? (CARRILES.find((c) => c.fase === t.requirement_phase)?.nombre ??
          String(t.requirement_phase))
        : 'Sin fase',
  },
  { k: 'talla', nombre: 'Talla', valor: (t) => (t.effort_size as string) ?? 'Sin estimar' },
  {
    k: 'etiqueta',
    nombre: 'Etiqueta',
    valor: (t) => {
      const g = t.tags as string[] | null;
      return g && g.length ? g : null;
    },
  },
];

/**
 * Las columnas de la rejilla: el entregable y las 7 fases. La cabecera y
 * todas las filas usan esta misma plantilla, que es lo que las mantiene
 * alineadas sin medir nada.
 */
const COLUMNAS = `minmax(230px, 1.15fr) repeat(${CARRILES.length}, minmax(135px, 1fr))`;

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
  // Los filtros viven detrás del embudo, como en Azure: lo permanente en la
  // barra es el ciclo, no los controles de filtrado.
  const [verFiltros, setVerFiltros] = useState(false);
  const [desplegado, setDesplegado] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Record<string, Set<string>>>({});
  const [texto, setTexto] = useState('');
  // El aviso de sin fase: plegado por defecto. Se puede ignorar, no descartar.
  const [verSinFase, setVerSinFase] = useState(false);
  // Clave del grupo que se está asignando en lote, para no lanzar dos a la vez.
  const [lote, setLote] = useState<string | null>(null);

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
  /** Las opciones de cada filtro, con cuántos tickets tiene cada una. */
  const opciones = useMemo(() => {
    const m: Record<string, Array<{ v: string; n: number }>> = {};
    for (const d of DIMENSIONES) {
      const cuenta: Record<string, number> = {};
      for (const t of items) {
        const v = d.valor(t);
        if (v === null) continue;
        for (const x of Array.isArray(v) ? v : [v]) cuenta[x] = (cuenta[x] ?? 0) + 1;
      }
      m[d.k] = Object.keys(cuenta)
        .sort()
        .map((v) => ({ v, n: cuenta[v]! }));
    }
    return m;
  }, [items]);

  const hayFiltro =
    texto.trim().length > 0 ||
    Object.values(seleccion).some((s) => s && s.size > 0);

  /** Los tickets que pasan los filtros. */
  const visibles = useMemo(() => {
    if (!hayFiltro) return items;
    const q = texto.trim().toLowerCase();
    return items.filter((t) => {
      if (q && !`${String(t.ticket_number)} ${String(t.title)}`.toLowerCase().includes(q)) {
        return false;
      }
      return DIMENSIONES.every((d) => {
        const s = seleccion[d.k];
        if (!s || s.size === 0) return true;
        const v = d.valor(t);
        if (v === null) return false;
        return (Array.isArray(v) ? v : [v]).some((x) => s.has(x));
      });
    });
  }, [items, seleccion, texto, hayFiltro]);

  const bandas = useMemo(() => {
    if (agrupar === 'ninguna') {
      return [
        {
          id: '__todas',
          titulo: null as string | null,
          cabecera: null as Row | null,
          tickets: visibles,
          reparto: repartir(visibles),
          contexto: false,
        },
      ];
    }

    // Un hijo puede pasar el filtro aunque su padre no: filtrar por un
    // desarrollador deja tickets cuyo entregable es de otro. Como cada fila
    // ES un entregable, sin tratarlo esos tickets desaparecerían de la
    // pantalla. Se conserva la fila del padre como CONTEXTO, atenuada, y sin
    // pintar su tarjeta: él no cumple el filtro.
    const pasaronPorSiMismos = new Set(
      visibles.filter((i) => i.is_deliverable).map((i) => String(i.id)),
    );
    const entregables = items.filter(
      (i) =>
        i.is_deliverable &&
        (pasaronPorSiMismos.has(String(i.id)) ||
          visibles.some((v) => String(v.parent_id ?? '') === String(i.id))),
    );
    const miembrosDe = new Map<string, Row[]>();
    for (const it of visibles) {
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
        contexto: !pasaronPorSiMismos.has(String(e.id)),
        // El padre va en la banda como una tarjeta más: es él quien lleva
        // el reloj, así que tiene que verse en su carril. Salvo cuando la
        // fila es solo contexto y él no pasó el filtro.
        tickets: pasaronPorSiMismos.has(String(e.id))
          ? [e, ...(miembrosDe.get(String(e.id)) ?? [])]
          : (miembrosDe.get(String(e.id)) ?? []),
      }));

    const sueltos = entregables.filter(
      (e) => (miembrosDe.get(String(e.id)) ?? []).length === 0,
    );

    const lista = [
      ...conGrupo,
      ...(sueltos.length
        ? [
            {
              id: '__sueltos',
              titulo: 'Sin agrupar',
              cabecera: null as Row | null,
              tickets: sueltos,
              contexto: false,
            },
          ]
        : []),
    ];

    // El reparto por fase se calcula UNA vez por banda, aquí. Estaba dentro
    // del map de carriles, así que recorría los tickets de la banda siete
    // veces en cada render, y cada arrastre provoca un render completo.
    return lista.map((b) => ({ ...b, reparto: repartir(b.tickets) }));
  }, [items, visibles, agrupar, repartir]);

  /**
   * Los que no tienen fase, de TODO el ciclo — nunca de lo filtrado. Un
   * filtro que silenciara este aviso dejaría entregables sin tramo abierto,
   * invisibles para el cálculo del atraso.
   */
  const sinFase = useMemo(() => items.filter((i) => !i.requirement_phase), [items]);

  // Estables entre renders. Una arrow inline cambia de identidad en cada
  // uno, y entonces da igual que el panel afine sus dependencias.
  const cerrarPanel = useCallback(() => setAbierta(null), []);
  const recargar = useCallback(() => void cargar(), [cargar]);
  const hermanos = useMemo(
    () => items.map((i) => ({ id: String(i.id), title: String(i.title) })),
    [items],
  );

  /**
   * Los sin fase, agrupados por su entregable. Trece sueltos son una lista
   * larga; los mismos trece en tres grupos caben en una pantalla, y además
   * dejan asignar la fase a todo un grupo de una vez.
   */
  const gruposSinFase = useMemo(() => {
    const m = new Map<string, { clave: string; titulo: string; tickets: Row[] }>();
    for (const t of sinFase) {
      const clave = String(t.parent_id ?? t.id);
      const titulo = String(t.parent_title ?? t.title ?? 'Sin agrupar');
      if (!m.has(clave)) m.set(clave, { clave, titulo, tickets: [] });
      m.get(clave)!.tickets.push(t);
    }
    return [...m.values()].sort((a, b) => b.tickets.length - a.tickets.length);
  }, [sinFase]);

  async function mover(ticketId: string, fase: Fase) {
    setMoviendo(ticketId);
    const r = await setPhaseAction(ticketId, fase as never);
    setMoviendo(null);
    if (r.error) setError(r.error);
    else await cargar();
  }

  /**
   * Asigna la misma fase a todos los tickets de un grupo.
   *
   * EN SERIE, A PROPÓSITO. Cada asignación dispara el trigger de 00077, que
   * abre un tramo congelando dueño y plazo: son escrituras en el camino del
   * descuento, no un cambio de interfaz. Si una falla a mitad, las anteriores
   * ya están aplicadas, y hay que poder decir cuántas fueron en vez de un
   * error genérico.
   *
   * Se recarga una sola vez al final, no una por ticket.
   */
  async function asignarAlGrupo(
    grupo: { clave: string; tickets: Row[] },
    fase: Fase,
  ) {
    setLote(grupo.clave);
    setError(null);

    let hechos = 0;
    const fallos: string[] = [];

    for (const t of grupo.tickets) {
      const r = await setPhaseAction(String(t.id), fase as never);
      if (r.error) fallos.push(`${String(t.ticket_number)}: ${r.error}`);
      else hechos++;
    }

    setLote(null);
    if (fallos.length) {
      setError(
        `Se asignaron ${hechos} de ${grupo.tickets.length}. Sin cambiar: ${fallos.join(' · ')}`,
      );
    }
    await cargar();
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
          variant={verFiltros || hayFiltro ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setVerFiltros(!verFiltros)}
          aria-expanded={verFiltros}
          title="Filtrar"
        >
          <ListFilter className="mr-1.5 h-3.5 w-3.5" />
          {hayFiltro ? `${visibles.length} de ${items.length}` : 'Filtrar'}
        </Button>
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

      {/* Los filtros. Escondidos por defecto, como en Azure: lo permanente
          en la barra es el ciclo, no los controles. Cada filtro admite
          varios valores y lleva al lado cuántos tickets tiene cada uno. */}
      {verFiltros ? (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Número o título…"
              className="h-8 w-56 text-xs"
              aria-label="Buscar por número o título"
            />

            {DIMENSIONES.map((d) => {
              const ops = opciones[d.k] ?? [];
              if (ops.length < 2) return null; // un solo valor no filtra nada
              const sel = seleccion[d.k];
              const n = sel?.size ?? 0;
              return (
                <div key={d.k} className="relative">
                  <Button
                    variant={n ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setDesplegado(desplegado === d.k ? null : d.k)}
                    aria-expanded={desplegado === d.k}
                  >
                    {d.nombre}
                    {n ? ` (${n})` : ''}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>

                  {desplegado === d.k ? (
                    <div className="bg-popover absolute left-0 top-full z-30 mt-1 max-h-64 min-w-48 overflow-auto rounded-md border p-1 shadow-lg">
                      {ops.map((o) => (
                        <label
                          key={o.v}
                          className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={sel?.has(o.v) ?? false}
                            onChange={(e) => {
                              setSeleccion((prev) => {
                                const n2 = { ...prev };
                                const c = new Set(n2[d.k] ?? []);
                                if (e.target.checked) c.add(o.v);
                                else c.delete(o.v);
                                n2[d.k] = c;
                                return n2;
                              });
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{o.v}</span>
                          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                            {o.n}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {hayFiltro ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setSeleccion({});
                  setTexto('');
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Limpiar
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8"
              onClick={() => setVerFiltros(false)}
              aria-label="Cerrar filtros"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
            {hayFiltro
              ? `${visibles.length} de ${items.length} tickets. Las filas atenuadas son el entregable de un ticket que sí pasó el filtro.`
              : `Sin filtros: se ven los ${items.length} tickets del ciclo.`}
          </p>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------
          Los que no tienen fase.

          NO HABER EMPEZADO NO ES UN ATRASO. Un requerimiento puede estar sin
          iniciar legítimamente: no todos arrancan el primer día del ciclo. La
          base ya lo trata así —un entregable sin fase sigue saliendo en
          cycle_sla_breaches pero con exposed_over = 0 y sin días—, de modo que
          esto es un recordatorio, no una alarma: «falta por iniciar», nunca
          «vas tarde».

          Por eso es una franja de una línea con un punto, y no un bloque
          ámbar: el ámbar dice «hay un problema», y aquí no lo hay todavía.
          Antes eran trece selectores siempre abiertos, tres renglones que
          competían con el tablero.

          Plegada se puede ignorar, pero no descartar: mientras quede uno, la
          línea sigue ahí.
          ------------------------------------------------------------------ */}
      {sinFase.length ? (
        <Card className="border-l-4 border-l-amber-500 p-0">
          <button
            type="button"
            onClick={() => setVerSinFase(!verSinFase)}
            aria-expanded={verSinFase}
            className="hover:bg-muted/40 flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
          >
            <i
              className="h-2 w-2 shrink-0 rounded-full bg-amber-500 motion-safe:animate-pulse"
              aria-hidden
            />
            <span className="text-sm font-medium">
              {sinFase.length} {sinFase.length === 1 ? 'ticket' : 'tickets'} sin fase
            </span>
            <span className="text-muted-foreground text-xs">
              — falta por iniciar: su reloj no corre
            </span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {gruposSinFase.length}{' '}
              {gruposSinFase.length === 1 ? 'entregable' : 'entregables'}
            </Badge>
            {verSinFase ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
          </button>

          {verSinFase ? (
            <div className="space-y-3 border-t px-3 py-2.5">
              {gruposSinFase.map((g) => (
                <div key={g.clave}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-semibold">{g.titulo}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {g.tickets.length}
                    </Badge>
                    {/* Siete de los trece cuelgan de un solo entregable, así
                        que asignar por grupo vacía media lista de un clic. */}
                    <Select
                      disabled={props.cycleClosed || lote !== null}
                      onValueChange={(v) => void asignarAlGrupo(g, v as Fase)}
                    >
                      <SelectTrigger className="ml-auto h-7 w-44 text-xs">
                        <SelectValue
                          placeholder={
                            lote === g.clave
                              ? 'Asignando…'
                              : `Asignar fase a ${g.tickets.length}`
                          }
                        />
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

                  <div className="space-y-1">
                    {g.tickets.map((it) => (
                      <div
                        key={String(it.id)}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                      >
                        <span className="text-muted-foreground shrink-0 font-mono text-[9px]">
                          {String(it.ticket_number ?? '')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAbierta(String(it.id))}
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          title={String(it.title)}
                        >
                          {String(it.title)}
                        </button>
                        <Select
                          disabled={
                            props.cycleClosed || moviendo === String(it.id) || lote !== null
                          }
                          onValueChange={(v) => void mover(String(it.id), v as Fase)}
                        >
                          <SelectTrigger className="h-7 w-36 shrink-0 text-xs">
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
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------
          El tablero, como el Taskboard de Azure DevOps: la fase se nombra UNA
          vez arriba y cada banda es una fila que la cruza.

          Antes cada banda repetía las 7 cabeceras — con 4 bandas eran 28
          cabeceras para 7 fases, y «Documentación» aparecía cuatro veces.

          La rejilla es una sola grid por fila con las mismas columnas que la
          cabecera, así que todo queda alineado sin medir nada.
          ------------------------------------------------------------------ */}
      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[1180px]">
          {/* Las cabeceras, una sola vez. El número es de TODO el ciclo: antes
              era por banda, y así no se podía leer la carga real. */}
          <div
            className="bg-card sticky top-0 z-10 grid border-b-2"
            style={{ gridTemplateColumns: COLUMNAS }}
          >
            <div className="border-r px-3 py-2">
              <h3 className="text-xs font-semibold">Entregable</h3>
              <p className="text-muted-foreground text-[9px] uppercase tracking-wide">
                lleva el reloj
              </p>
            </div>
            {CARRILES.map((carril) => (
              <div key={carril.fase} className="border-r px-3 py-2 last:border-r-0">
                <div className="flex items-center gap-1.5">
                  <i className={`h-2 w-2 shrink-0 rounded-full ${OWNER_COLOR[carril.owner]}`} />
                  <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {carril.nombre}
                  </h3>
                  <span className="text-muted-foreground bg-muted rounded-full px-1.5 font-mono text-[10px] tabular-nums">
                    {visibles.filter((i) => i.requirement_phase === carril.fase).length}
                  </span>
                </div>
                <p className="text-muted-foreground text-[9px] uppercase tracking-wide">
                  {/* Sin esto, «Por iniciar» parecería un carril con plazo
                      como los demás, y es justo lo contrario. */}
                  {carril.fase === 'propuesto' ? 'sin plazo' : OWNER_LABEL[carril.owner]}
                </p>
              </div>
            ))}
          </div>

          {bandas.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              Este ciclo no tiene tickets asignados.
            </p>
          ) : null}

          {bandas.map((banda) => {
            const plegada = plegados.has(banda.id);
            const d = (banda.cabecera?.delay ?? {}) as Record<string, number>;
            const expuestoBanda = Number(d.exposed_over ?? 0);

            return (
              <div
                key={banda.id}
                className="grid border-b last:border-b-0"
                style={{ gridTemplateColumns: COLUMNAS }}
              >
                {/* El entregable, fuera de los carriles: es suyo el plazo del
                    Anexo C, no de cada ticket. Su TARJETA sigue estando en la
                    columna de su fase, porque arrastrarla es la forma de mover
                    el reloj. */}
                <div
                  className={`bg-muted/40 border-r-2 px-3 py-2 ${
                    banda.contexto ? 'opacity-60' : ''
                  }`}
                >
                  {banda.titulo ? (
                    <>
                      <div className="flex items-start gap-1.5">
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
                          className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                          aria-expanded={!plegada}
                          aria-label={plegada ? 'Desplegar' : 'Plegar'}
                        >
                          {plegada ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {banda.cabecera ? (
                          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                        ) : null}
                        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">
                          {banda.titulo}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
                                +{expuestoBanda}d · {cop(expuestoBanda * COP_POR_CREDITO)}
                              </Badge>
                            ) : null}
                          </>
                        ) : null}
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {banda.tickets.length} tkt
                        </span>
                        {banda.contexto ? (
                          <Badge variant="outline" className="border-dashed text-[9px]">
                            fuera del filtro
                          </Badge>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {banda.tickets.length} ticket{banda.tickets.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>

                {/* Las 7 celdas de la fila. Cada una es una zona de soltar. */}
                {CARRILES.map((carril) => {
                  const enCarril = plegada ? [] : (banda.reparto[carril.fase] ?? []);
                  // Única por celda: con solo la fase se encenderían las siete
                  // celdas de esa columna en todas las filas a la vez.
                  const zona = `${banda.id}:${carril.fase}`;
                  return (
                    <div
                      key={carril.fase}
                      // min-h: una celda vacía sin altura no se puede soltar,
                      // y a simple vista parece que está bien.
                      className={`flex min-h-20 flex-col gap-2 border-r p-2 last:border-r-0 ${
                        sobre === zona ? 'bg-primary/5 ring-primary ring-1 ring-inset' : ''
                      }`}
                      onDragOver={(e) => {
                        // Sin esto el navegador no deja soltar en ningún sitio.
                        e.preventDefault();
                        setSobre(zona);
                      }}
                      onDragLeave={() => setSobre(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setSobre(null);
                        // dataTransfer es el camino bueno cuando el estado de
                        // React no llegó (pasa en Firefox).
                        const id = arrastrando ?? e.dataTransfer.getData('text/plain');
                        if (id) void mover(id, carril.fase);
                        setArrastrando(null);
                      }}
                    >
                      {plegada ? (
                        <span className="text-muted-foreground/40 m-auto text-[11px]">·</span>
                      ) : enCarril.length === 0 ? (
                        <span className="text-muted-foreground/30 m-auto text-sm">·</span>
                      ) : (
                        enCarril.map((it) => (
                          <Tarjeta
                            key={String(it.id)}
                            item={it}
                            espera={esperaDe[String(it.id)]}
                            moviendo={moviendo === String(it.id)}
                            bloqueado={props.cycleClosed}
                            densidad={densidad}
                            // Dentro de una fila el entregable ya está a la
                            // izquierda: repetirlo en cada tarjeta es ruido.
                            mostrarPadre={agrupar === 'ninguna'}
                            onAbrir={() => setAbierta(String(it.id))}
                            onDragStart={() => setArrastrando(String(it.id))}
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* El panel lateral: se gestiona el requerimiento como un ticket
          —checklist, comentarios, menciones— sin salir del tablero. */}
      {abierta ? (
        <CardPanel
          ticketId={abierta}
          hermanos={hermanos}
          bloqueado={props.cycleClosed}
          onCerrar={cerrarPanel}
          onIr={setAbierta}
          onCambio={recargar}
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
                {expuesto > 0 ? ` · expone ${cop(expuesto * COP_POR_CREDITO)}` : ''}
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
