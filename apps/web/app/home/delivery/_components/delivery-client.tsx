'use client';

// ---------------------------------------------------------------------------
// Gestión de proyectos — interfaz
// ---------------------------------------------------------------------------
// Cuatro vistas sobre el mismo proyecto: backlog, planning del ciclo,
// capacidad del equipo y la cola de triage.
//
// Un criterio que recorre toda la pantalla: los items sin estimar se cuentan
// aparte, nunca como cero. "Faltan 8 por estimar" es una conversación
// distinta de "el proyecto pesa 40 puntos", y mezclarlas hace que un ciclo
// parezca holgado cuando no se sabe lo que pesa.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Inbox,
  KanbanSquare,
  Layers,
  Loader2,
  Users,
  XCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import {
  acceptProposalAction,
  addTimeOffAction,
  assignToCycleAction,
  capacityAction,
  closeCycleAction,
  copyCapacityAction,
  createCycleAction,
  cycleStatusAction,
  estimateItemAction,
  listBacklogAction,
  listCycleItemsAction,
  listProposalsAction,
  rejectProposalAction,
  setCapacityAction,
} from '~/lib/actions/delivery';

import { CycleBoard } from './cycle-board';
import { GroupDialog } from './group-dialog';
import { PhaseSlaTab } from './phase-sla-tab';

const TALLAS = ['S', 'M', 'L', 'XL'] as const;
type Talla = (typeof TALLAS)[number];

interface Proyecto {
  id: string;
  name: string;
  status: string;
  organization_id: string | null;
  organizations: { name: string } | null;
}

interface Ciclo {
  id: string;
  cycle_number: number;
  name: string | null;
  starts_on: string;
  ends_on: string;
  committed_points: number | null;
  status: string;
  delivered_points: number | null;
}

interface Item {
  id: string;
  ticket_number: string;
  title: string;
  type: string;
  status: string;
  effort_size: string | null;
  effort_points: number | null;
  project_id: string | null;
  delivery_cycle_id?: string | null;
  // Los trae listCycleItems para pintar un entregable: en qué fase va y
  // cuántos de sus tickets están listos. Opcionales porque listBacklog, que
  // alimenta la pestaña de backlog, no los devuelve.
  requirement_phase?: string | null;
  member_count?: number;
  members_done?: number;
}

export interface DeliveryClientProps {
  projects: Proyecto[];
  agents: Array<{ id: string; name: string; role: string }>;
  selectedProjectId: string | null;
  cycles: Ciclo[];
  scale: Record<string, number>;
  initialTab: string;
  initialCycleId: string | null;
  isAdmin: boolean;
}

export function DeliveryClient(props: DeliveryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [tab, setTab] = useState(props.initialTab);
  const [cycleId, setCycleId] = useState<string | null>(props.initialCycleId);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [cycleStatus, setCycleStatus] = useState<Record<string, unknown> | null>(null);
  const [capacity, setCapacity] = useState<{
    agents: Array<Record<string, unknown>>;
    totals: Record<string, number>;
  } | null>(null);
  const [proposals, setProposals] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const proyecto = useMemo(
    () => props.projects.find((p) => p.id === props.selectedProjectId) ?? null,
    [props.projects, props.selectedProjectId],
  );

  const ciclo = useMemo(
    () => props.cycles.find((c) => c.id === cycleId) ?? null,
    [props.cycles, cycleId],
  );

  /** Cambia un parámetro de la URL sin perder los demás. */
  const navegar = useCallback(
    (cambios: Record<string, string | null>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      router.push(`/home/delivery?${q.toString()}`);
    },
    [router, searchParams],
  );

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'backlog') {
        const r = await listBacklogAction({
          project_id: props.selectedProjectId,
          limit: 200,
        });
        if (r.error) setError(r.error);
        else {
          setItems((r.data?.items ?? []) as Item[]);
          setTotals(r.data?.totals ?? {});
        }
      } else if ((tab === 'planning' || tab === 'board') && cycleId) {
        // El planning y el tablero miran lo mismo: los ENTREGABLES del
        // ciclo. listBacklog no sirve aquí — filtra por tipo, así que deja
        // fuera un entregable reusado de garantía, y devuelve los tickets
        // planos en vez de los grupos.
        const [st, ci] = await Promise.all([
          cycleStatusAction(cycleId),
          listCycleItemsAction(cycleId),
        ]);
        if (st.error) setError(st.error);
        else setCycleStatus(st.data as Record<string, unknown>);
        if (ci.error) setError(ci.error);
        else setItems((ci.data ?? []) as unknown as Item[]);
      } else if (tab === 'capacity' && cycleId) {
        const r = await capacityAction(cycleId);
        if (r.error) setError(r.error);
        else setCapacity(r.data as typeof capacity);
      } else if (tab === 'triage') {
        const r = await listProposalsAction();
        if (r.error) setError(r.error);
        else setProposals((r.data?.proposals ?? []) as Item[]);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, cycleId, props.selectedProjectId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Ejecuta una acción y recarga; los errores se muestran, no se tragan. */
  const ejecutar = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      await recargar();
      router.refresh();
    });
  };

  if (!props.projects.length) {
    return (
      <div className="p-8">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ClipboardList className="text-muted-foreground mx-auto h-10 w-10" />
          <h2 className="mt-4 text-lg font-semibold">Todavía no hay proyectos</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Un proyecto agrupa el backlog, los ciclos y la capacidad de un cliente.
            Créalo desde Proyectos para empezar a planificar.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gestión de proyectos</h1>
          <p className="text-muted-foreground text-sm">
            Backlog, ciclos de entrega y capacidad del equipo
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={props.selectedProjectId ?? undefined}
            onValueChange={(v) => navegar({ project: v, cycle: null })}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Proyecto" />
            </SelectTrigger>
            <SelectContent>
              {props.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.organizations?.name ? ` · ${p.organizations.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {props.cycles.length > 0 ? (
            <Select
              value={cycleId ?? undefined}
              onValueChange={(v) => {
                setCycleId(v);
                navegar({ cycle: v });
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Ciclo" />
              </SelectTrigger>
              <SelectContent>
                {props.cycles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Ciclo {c.cycle_number}
                    {c.name ? ` · ${c.name}` : ''}
                    {c.status === 'closed' ? ' (cerrado)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          navegar({ tab: v });
        }}
      >
        <TabsList>
          <TabsTrigger value="backlog">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Backlog
          </TabsTrigger>
          <TabsTrigger value="planning">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Planning
          </TabsTrigger>
          <TabsTrigger value="board">
            <KanbanSquare className="mr-1.5 h-4 w-4" />
            Tablero
          </TabsTrigger>
          <TabsTrigger value="capacity">
            <Users className="mr-1.5 h-4 w-4" />
            Capacidad
          </TabsTrigger>
          <TabsTrigger value="triage">
            <Inbox className="mr-1.5 h-4 w-4" />
            Triage
            {proposals.length ? (
              <Badge variant="secondary" className="ml-1.5">
                {proposals.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="sla">
            <Gauge className="mr-1.5 h-4 w-4" />
            SLA por fase
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backlog" className="mt-4">
          <VistaBacklog
            items={items}
            totals={totals}
            scale={props.scale}
            cycles={props.cycles}
            loading={loading}
            pending={pending}
            projectId={props.selectedProjectId}
            cycleIdActual={cycleId}
            onAgrupado={() => void recargar()}
            onEstimar={(id, talla) => ejecutar(() => estimateItemAction(id, talla))}
            onACiclo={(id, cid) => ejecutar(() => assignToCycleAction(id, cid))}
          />
        </TabsContent>

        <TabsContent value="planning" className="mt-4">
          <VistaPlanning
            proyecto={proyecto}
            ciclo={ciclo}
            cycles={props.cycles}
            status={cycleStatus}
            items={items}
            loading={loading}
            pending={pending}
            isAdmin={props.isAdmin}
            onCrearCiclo={(f) =>
              ejecutar(() => createCycleAction(props.selectedProjectId!, f))
            }
            onCerrar={(id) => ejecutar(() => closeCycleAction(id))}
            onSacar={(id) => ejecutar(() => assignToCycleAction(id, null))}
          />
        </TabsContent>

        {/* El tablero por fases: donde el PM gestiona el ciclo tarjeta a
            tarjeta. Arrastrar cambia la fase y, con ella, el dueño del reloj. */}
        <TabsContent value="board" className="mt-4">
          <CycleBoard
            cycleId={cycleId}
            cycleStatus={cycleStatus}
            organizationId={proyecto?.organization_id ?? null}
            cycleClosed={props.cycles.find((c) => c.id === cycleId)?.status === 'closed'}
          />
        </TabsContent>

        <TabsContent value="capacity" className="mt-4">
          <VistaCapacidad
            ciclo={ciclo}
            cycles={props.cycles}
            agents={props.agents}
            capacity={capacity}
            loading={loading}
            pending={pending}
            onFijar={(aid, h, o) =>
              ejecutar(() => setCapacityAction(cycleId!, aid, h, o))
            }
            onCopiar={(from) => ejecutar(() => copyCapacityAction(from, cycleId!))}
            onAusencia={(aid, d, h) =>
              ejecutar(() => addTimeOffAction(aid, d, h, 'vacation'))
            }
          />
        </TabsContent>

        <TabsContent value="triage" className="mt-4">
          <VistaTriage
            proposals={proposals}
            scale={props.scale}
            cycles={props.cycles}
            projectId={props.selectedProjectId}
            loading={loading}
            pending={pending}
            onAceptar={(id, size, cid) =>
              ejecutar(() =>
                acceptProposalAction(id, {
                  size,
                  cycle_id: cid,
                  project_id: props.selectedProjectId,
                }),
              )
            }
            onRechazar={(id, motivo) => ejecutar(() => rejectProposalAction(id, motivo))}
          />
        </TabsContent>

        {/* El SLA de fases del Anexo C. Vive en su propio componente porque
            lee de otras funciones (00076-00079) y no comparte estado con las
            otras cuatro vistas. */}
        <TabsContent value="sla" className="mt-4">
          <PhaseSlaTab
            cycles={props.cycles}
            selectedCycleId={cycleId}
            projectId={props.selectedProjectId}
            organizationId={proyecto?.organization_id ?? null}
            onCycleChange={(id) => {
              setCycleId(id);
              navegar({ cycle: id });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Cargando() {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando…
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string | number;
  tono?: 'alerta' | 'ok';
}) {
  const color =
    tono === 'alerta'
      ? 'text-amber-600 dark:text-amber-400'
      : tono === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : '';
  return (
    <Card className="p-4">
      <div className="text-muted-foreground text-xs">{etiqueta}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{valor}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Backlog
// ---------------------------------------------------------------------------

function VistaBacklog({
  items,
  totals,
  scale,
  cycles,
  loading,
  pending,
  projectId,
  cycleIdActual,
  onEstimar,
  onACiclo,
  onAgrupado,
}: {
  items: Item[];
  totals: Record<string, number>;
  scale: Record<string, number>;
  cycles: Ciclo[];
  loading: boolean;
  pending: boolean;
  projectId: string | null;
  cycleIdActual: string | null;
  onEstimar: (id: string, talla: Talla) => void;
  onACiclo: (id: string, cycleId: string | null) => void;
  onAgrupado: () => void;
}) {
  // La selección vive aquí y no en el componente padre: es estado de esta
  // vista y se pierde al cambiar de pestaña, que es lo que se espera.
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [agrupando, setAgrupando] = useState(false);

  if (loading) return <Cargando />;

  const abiertos = cycles.filter((c) => c.status !== 'closed');
  const seleccionados = items.filter((i) => marcados.has(i.id));

  const alternar = (id: string) =>
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metrica etiqueta="Items" valor={totals.items ?? 0} />
        <Metrica etiqueta="Puntos estimados" valor={totals.points ?? 0} />
        <Metrica
          etiqueta="Sin estimar"
          valor={totals.unestimated ?? 0}
          tono={totals.unestimated ? 'alerta' : undefined}
        />
        <Metrica etiqueta="Estimados" valor={totals.estimated ?? 0} />
      </div>

      {totals.unestimated ? (
        <p className="text-muted-foreground text-xs">
          Los {totals.unestimated} items sin estimar no suman a los puntos: un ciclo
          parece holgado hasta que se sabe cuánto pesan.
        </p>
      ) : null}

      {/* Agrupar es la decisión de la reunión de refinement: varios tickets
          pasan a ser un entregable con una talla y unos créditos. */}
      {agrupando ? (
        <GroupDialog
          seleccionados={seleccionados.map((s) => ({
            id: s.id,
            ticket_number: s.ticket_number,
            title: s.title,
            type: s.type,
          }))}
          scale={scale}
          cycles={cycles}
          cycleIdSugerido={cycleIdActual}
          projectId={projectId}
          onCancelar={() => setAgrupando(false)}
          onListo={() => {
            setAgrupando(false);
            setMarcados(new Set());
            onAgrupado();
          }}
        />
      ) : marcados.size > 0 ? (
        <Card className="border-primary/40 bg-primary/5 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-medium">
            {marcados.size} seleccionado{marcados.size === 1 ? '' : 's'}
          </span>
          <Button size="sm" onClick={() => setAgrupando(true)} disabled={pending}>
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Agrupar en un requerimiento
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Quitar selección
          </Button>
          <span className="text-muted-foreground ml-auto text-[11px]">
            Un ticket que no se agrupe sigue siendo su propio entregable.
          </span>
        </Card>
      ) : null}

      {!items.length ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No hay items de backlog en este proyecto.
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {items.map((it) => (
            <div
              key={it.id}
              className={`flex flex-wrap items-center gap-3 p-3 ${
                marcados.has(it.id) ? 'bg-primary/5' : ''
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-violet-600"
                checked={marcados.has(it.id)}
                onChange={() => alternar(it.id)}
                aria-label={`Seleccionar ${it.ticket_number}`}
              />
              <span className="text-muted-foreground w-32 shrink-0 font-mono text-xs">
                {it.ticket_number}
              </span>
              <span className="min-w-[200px] flex-1 truncate text-sm" title={it.title}>
                {it.title}
              </span>

              <Badge variant="outline">{it.type}</Badge>

              <Select
                value={it.effort_size ?? undefined}
                disabled={pending}
                onValueChange={(v) => onEstimar(it.id, v as Talla)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Talla" />
                </SelectTrigger>
                <SelectContent>
                  {TALLAS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t} · {scale[t] ?? '?'} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="w-16 text-right text-sm font-medium">
                {it.effort_points ?? '—'}
              </span>

              {abiertos.length ? (
                <Select
                  value={it.delivery_cycle_id ?? 'none'}
                  disabled={pending}
                  onValueChange={(v) => onACiclo(it.id, v === 'none' ? null : v)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Ciclo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin ciclo</SelectItem>
                    {abiertos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Ciclo {c.cycle_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

function VistaPlanning({
  proyecto,
  ciclo,
  cycles,
  status,
  items,
  loading,
  pending,
  isAdmin,
  onCrearCiclo,
  onCerrar,
  onSacar,
}: {
  proyecto: Proyecto | null;
  ciclo: Ciclo | null;
  cycles: Ciclo[];
  status: Record<string, unknown> | null;
  items: Item[];
  loading: boolean;
  pending: boolean;
  isAdmin: boolean;
  onCrearCiclo: (f: {
    cycle_number: number;
    starts_on: string;
    ends_on: string;
    committed_points?: number | null;
  }) => void;
  onCerrar: (id: string) => void;
  onSacar: (id: string) => void;
}) {
  const [nuevo, setNuevo] = useState({
    cycle_number: (cycles[0]?.cycle_number ?? 0) + 1,
    starts_on: '',
    ends_on: '',
    committed_points: '',
  });

  if (loading) return <Cargando />;

  // listCycleItems ya devuelve solo los ENTREGABLES de este ciclo, sin los
  // miembros de un grupo. Filtrar otra vez por delivery_cycle_id dejaba la
  // lista vacía cuando ese campo no venía en la fila.
  const delCiclo = items;
  const sobre = Boolean(status?.over_commitment);

  return (
    <div className="space-y-4">
      {!ciclo ? (
        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-medium">Crear el primer ciclo</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Un ciclo agrupa lo que el equipo se compromete a entregar en un periodo.
              No es el ciclo de facturación del contrato, que va por su cuenta.
            </p>
          </div>
          <FormularioCiclo
            valores={nuevo}
            onChange={setNuevo}
            pending={pending}
            disabled={!proyecto}
            onSubmit={() =>
              onCrearCiclo({
                cycle_number: Number(nuevo.cycle_number),
                starts_on: nuevo.starts_on,
                ends_on: nuevo.ends_on,
                committed_points: nuevo.committed_points
                  ? Number(nuevo.committed_points)
                  : null,
              })
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metrica
              etiqueta="Comprometido"
              valor={(status?.committed_points as number) ?? '—'}
            />
            <Metrica
              etiqueta="Asignado"
              valor={(status?.assigned_points as number) ?? 0}
              tono={sobre ? 'alerta' : undefined}
            />
            <Metrica
              etiqueta="Entregado"
              valor={(status?.delivered_points as number) ?? 0}
              tono="ok"
            />
            <Metrica
              etiqueta="Sin estimar"
              valor={(status?.items_unestimated as number) ?? 0}
              tono={status?.items_unestimated ? 'alerta' : undefined}
            />
          </div>

          {sobre ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              El ciclo tiene más puntos asignados que comprometidos. Para meter algo
              más hay que sacar algo de peso equivalente.
            </div>
          ) : null}

          <Card className="divide-y">
            <div className="flex items-center justify-between p-3">
              <div className="text-sm font-medium">
                Ciclo {ciclo.cycle_number}
                {ciclo.name ? ` · ${ciclo.name}` : ''}
                <span className="text-muted-foreground ml-2 font-normal">
                  {ciclo.starts_on} → {ciclo.ends_on}
                </span>
              </div>
              {ciclo.status !== 'closed' && isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onCerrar(ciclo.id)}
                >
                  Cerrar ciclo
                </Button>
              ) : (
                <Badge variant={ciclo.status === 'closed' ? 'secondary' : 'outline'}>
                  {ciclo.status}
                </Badge>
              )}
            </div>

            {!delCiclo.length ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                Sin items comprometidos. Asígnalos desde el backlog.
              </p>
            ) : (
              delCiclo.map((it) => (
                <div key={it.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="text-muted-foreground w-32 shrink-0 font-mono text-xs">
                    {it.ticket_number}
                  </span>
                  <span className="min-w-[180px] flex-1 truncate text-sm">{it.title}</span>
                  {/* Un grupo dice cuántos de sus tickets van listos: es lo
                      que explica por qué sigue abierto. */}
                  {Number(it.member_count ?? 0) > 0 ? (
                    <Badge variant="outline" className="text-[10px]">
                      {String(it.members_done ?? 0)} de{' '}
                      {String(it.member_count)} listos
                    </Badge>
                  ) : null}
                  {it.requirement_phase ? (
                    <Badge className="text-[10px]">
                      {String(it.requirement_phase)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      sin fase
                    </Badge>
                  )}
                  <Badge variant="outline">{it.status}</Badge>
                  <span className="w-16 text-right text-sm font-medium">
                    {it.effort_points ?? '—'}
                  </span>
                  {ciclo.status !== 'closed' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onSacar(it.id)}
                    >
                      Sacar
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <h3 className="text-sm font-medium">Crear otro ciclo</h3>
            <FormularioCiclo
              valores={nuevo}
              onChange={setNuevo}
              pending={pending}
              disabled={!proyecto}
              onSubmit={() =>
                onCrearCiclo({
                  cycle_number: Number(nuevo.cycle_number),
                  starts_on: nuevo.starts_on,
                  ends_on: nuevo.ends_on,
                  committed_points: nuevo.committed_points
                    ? Number(nuevo.committed_points)
                    : null,
                })
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}

function FormularioCiclo({
  valores,
  onChange,
  onSubmit,
  pending,
  disabled,
}: {
  valores: { cycle_number: number; starts_on: string; ends_on: string; committed_points: string };
  onChange: (v: typeof valores) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  const completo = valores.starts_on && valores.ends_on && valores.cycle_number > 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">Número</Label>
        <Input
          type="number"
          min={1}
          className="w-24"
          value={valores.cycle_number}
          onChange={(e) => onChange({ ...valores, cycle_number: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label className="text-xs">Inicio</Label>
        <Input
          type="date"
          className="w-40"
          value={valores.starts_on}
          onChange={(e) => onChange({ ...valores, starts_on: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Fin</Label>
        <Input
          type="date"
          className="w-40"
          value={valores.ends_on}
          onChange={(e) => onChange({ ...valores, ends_on: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Puntos comprometidos</Label>
        <Input
          type="number"
          min={0}
          className="w-40"
          placeholder="opcional"
          value={valores.committed_points}
          onChange={(e) => onChange({ ...valores, committed_points: e.target.value })}
        />
      </div>
      <Button disabled={pending || disabled || !completo} onClick={onSubmit}>
        Crear ciclo
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capacidad
// ---------------------------------------------------------------------------

function VistaCapacidad({
  ciclo,
  cycles,
  agents,
  capacity,
  loading,
  pending,
  onFijar,
  onCopiar,
  onAusencia,
}: {
  ciclo: Ciclo | null;
  cycles: Ciclo[];
  agents: Array<{ id: string; name: string; role: string }>;
  capacity: { agents: Array<Record<string, unknown>>; totals: Record<string, number> } | null;
  loading: boolean;
  pending: boolean;
  onFijar: (agentId: string, horas: number, overhead: number) => void;
  onCopiar: (fromCycleId: string) => void;
  onAusencia: (agentId: string, desde: string, hasta: string) => void;
}) {
  const [nueva, setNueva] = useState({ agent_id: '', hours: '6', overhead: '0' });
  const [ausencia, setAusencia] = useState({ agent_id: '', desde: '', hasta: '' });

  if (!ciclo) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Elige un ciclo para ver y configurar la capacidad del equipo.
        </p>
      </Card>
    );
  }

  if (loading) return <Cargando />;

  const filas = capacity?.agents ?? [];
  const otros = cycles.filter((c) => c.id !== ciclo.id);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metrica etiqueta="Personas" valor={capacity?.totals.people ?? 0} />
        <Metrica
          etiqueta="Horas disponibles"
          valor={Math.round(capacity?.totals.available_hours ?? 0)}
        />
        <Metrica
          etiqueta="Sobre-asignadas"
          valor={capacity?.totals.over_allocated ?? 0}
          tono={capacity?.totals.over_allocated ? 'alerta' : 'ok'}
        />
      </div>

      {!filas.length ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Nadie tiene capacidad configurada en este ciclo.
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {filas.map((f) => {
            const sobre = Boolean(f.over_allocated);
            const pct = f.utilization_pct ? Number(f.utilization_pct) : 0;
            return (
              <div key={String(f.agent_id)} className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{String(f.agent_name)}</span>
                  <span className={`text-sm ${sobre ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {Number(f.assigned_hours ?? 0)} / {Number(f.available_hours ?? 0)} h
                    {f.utilization_pct ? ` · ${pct}%` : ''}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${sobre ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="text-muted-foreground text-xs">
                  {Number(f.working_days ?? 0)} días hábiles
                  {Number(f.days_off ?? 0) ? ` − ${Number(f.days_off)} de ausencia` : ''}
                  {Number(f.overhead_hours ?? 0)
                    ? ` − ${Number(f.overhead_hours)} h de overhead`
                    : ''}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-medium">Configurar dedicación</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Persona</Label>
            <Select
              value={nueva.agent_id || undefined}
              onValueChange={(v) => setNueva({ ...nueva, agent_id: v })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Horas/día</Label>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              className="w-28"
              value={nueva.hours}
              onChange={(e) => setNueva({ ...nueva, hours: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Overhead (h)</Label>
            <Input
              type="number"
              min="0"
              className="w-32"
              value={nueva.overhead}
              onChange={(e) => setNueva({ ...nueva, overhead: e.target.value })}
            />
          </div>
          <Button
            disabled={pending || !nueva.agent_id || ciclo.status === 'closed'}
            onClick={() =>
              onFijar(nueva.agent_id, Number(nueva.hours), Number(nueva.overhead))
            }
          >
            Guardar
          </Button>

          {otros.length ? (
            <Select onValueChange={(v) => onCopiar(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Copiar de otro ciclo" />
              </SelectTrigger>
              <SelectContent>
                {otros.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Ciclo {c.cycle_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <p className="text-muted-foreground text-xs">
          Las horas/día son la dedicación a este ciclo, no la jornada: alguien puede
          repartirse entre varios proyectos. El overhead son reuniones y soporte, que
          se restan de la capacidad. Los festivos ya se descuentan solos.
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-medium">Registrar ausencia</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Persona</Label>
            <Select
              value={ausencia.agent_id || undefined}
              onValueChange={(v) => setAusencia({ ...ausencia, agent_id: v })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              className="w-40"
              value={ausencia.desde}
              onChange={(e) => setAusencia({ ...ausencia, desde: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              className="w-40"
              value={ausencia.hasta}
              onChange={(e) => setAusencia({ ...ausencia, hasta: e.target.value })}
            />
          </div>
          <Button
            variant="outline"
            disabled={
              pending || !ausencia.agent_id || !ausencia.desde || !ausencia.hasta
            }
            onClick={() => onAusencia(ausencia.agent_id, ausencia.desde, ausencia.hasta)}
          >
            Registrar
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

function VistaTriage({
  proposals,
  scale,
  cycles,
  projectId,
  loading,
  pending,
  onAceptar,
  onRechazar,
}: {
  proposals: Item[];
  scale: Record<string, number>;
  cycles: Ciclo[];
  projectId: string | null;
  loading: boolean;
  pending: boolean;
  onAceptar: (id: string, size: Talla | null, cycleId: string | null) => void;
  onRechazar: (id: string, motivo: string | null) => void;
}) {
  const [seleccion, setSeleccion] = useState<Record<string, { size?: Talla; cycle?: string }>>(
    {},
  );

  if (loading) return <Cargando />;

  const abiertos = cycles.filter((c) => c.status !== 'closed');

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Lo que los clientes han propuesto desde el portal. Una propuesta no consume
        cupo del contrato ni cuenta en el ciclo hasta que se acepta — ese es el punto
        de que exista esta cola.
      </p>

      {!proposals.length ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm font-medium">No hay propuestas pendientes</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Todo lo que han pedido los clientes ya está decidido.
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {proposals.map((p) => {
            const sel = seleccion[p.id] ?? {};
            return (
              <div key={p.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-muted-foreground w-36 shrink-0 font-mono text-xs">
                    {p.ticket_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.title}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={sel.size}
                    onValueChange={(v) =>
                      setSeleccion({ ...seleccion, [p.id]: { ...sel, size: v as Talla } })
                    }
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Talla" />
                    </SelectTrigger>
                    <SelectContent>
                      {TALLAS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t} · {scale[t] ?? '?'} pts
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {abiertos.length ? (
                    <Select
                      value={sel.cycle}
                      onValueChange={(v) =>
                        setSeleccion({ ...seleccion, [p.id]: { ...sel, cycle: v } })
                      }
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Ciclo (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {abiertos.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            Ciclo {c.cycle_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  <Button
                    size="sm"
                    disabled={pending || !projectId}
                    onClick={() => onAceptar(p.id, sel.size ?? null, sel.cycle ?? null)}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Aceptar
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onRechazar(p.id, null)}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Rechazar
                  </Button>
                </div>

                {sel.size ? (
                  <p className="text-muted-foreground text-xs">
                    Al aceptar se congelan {scale[sel.size] ?? '?'} puntos en el item.
                    Recalibrar la escala después no alterará este valor.
                  </p>
                ) : null}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
