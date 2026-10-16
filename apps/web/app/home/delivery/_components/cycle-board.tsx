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
// Arrastrar usa la API nativa de HTML5 en vez de una librería: son 7 carriles
// y una lista corta, y una dependencia más para esto no se paga sola.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AlertTriangle, CheckCircle2, Clock, Loader2, Users } from 'lucide-react';

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
  closeWaitAction,
  listCycleItemsAction,
  listOpenWaitsAction,
  openWaitAction,
  phaseSlaAction,
  setPhaseAction,
} from '~/lib/actions/delivery';

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

const MOTIVOS = [
  { v: 'espera_cliente_info', l: 'Información del cliente' },
  { v: 'espera_cliente_validacion', l: 'Validación o aprobación' },
  { v: 'dependencia_tercero', l: 'Dependencia de un tercero' },
  { v: 'ventana_mantenimiento', l: 'Ventana de mantenimiento' },
  { v: 'fuerza_mayor', l: 'Fuerza mayor' },
  { v: 'priorizacion_interna', l: 'Prioridad interna (no pausa)' },
] as const;

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

  const porFase = useMemo(() => {
    const m: Record<string, Row[]> = {};
    for (const c of CARRILES) m[c.fase] = [];
    m.__sin = [];
    for (const it of items) {
      const f = String(it.requirement_phase ?? '');
      if (m[f]) m[f]!.push(it);
      else m.__sin!.push(it);
    }
    return m;
  }, [items]);

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
          {items.length} entregable{items.length === 1 ? '' : 's'}
        </Card>
        {waits.length ? (
          <Card className="border-violet-400/50 px-3 py-1.5">
            <Clock className="mr-1 inline h-3 w-3" />
            {waits.length} espera{waits.length === 1 ? '' : 's'} abierta
            {waits.length === 1 ? '' : 's'}
          </Card>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
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

      {/* Los que aún no tienen fase: el reloj no corre hasta asignarles una */}
      {porFase.__sin?.length ? (
        <Card className="border-amber-400/50 p-3">
          <p className="mb-2 text-sm font-medium">
            <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
            {porFase.__sin.length} entregable(s) sin fase — su plazo no se está midiendo
          </p>
          <div className="flex flex-wrap gap-2">
            {porFase.__sin.map((it) => (
              <div
                key={String(it.id)}
                className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
              >
                <span className="max-w-56 truncate">{String(it.title)}</span>
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

      {/* El tablero */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {CARRILES.map((carril) => {
          const enCarril = porFase[carril.fase] ?? [];
          return (
            <div
              key={carril.fase}
              className={`flex w-60 shrink-0 flex-col rounded-md border ${
                sobre === carril.fase ? 'border-primary bg-primary/5' : 'bg-card'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(carril.fase);
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
                <h3 className="flex-1 truncate text-xs font-semibold">{carril.nombre}</h3>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {enCarril.length}
                </span>
                <Badge variant="outline" className="text-[9px]">
                  {OWNER_LABEL[carril.owner]}
                </Badge>
              </div>

              <div className="flex min-h-36 flex-col gap-2 p-2">
                {enCarril.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-[11px] italic">
                    sin ítems
                  </p>
                ) : (
                  enCarril.map((it) => (
                    <Tarjeta
                      key={String(it.id)}
                      item={it}
                      espera={esperaDe[String(it.id)]}
                      moviendo={moviendo === String(it.id)}
                      bloqueado={props.cycleClosed}
                      abierta={abierta === String(it.id)}
                      onAbrir={() =>
                        setAbierta(abierta === String(it.id) ? null : String(it.id))
                      }
                      onDragStart={() => setArrastrando(String(it.id))}
                      onCambio={() => void cargar()}
                      onError={setError}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
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
  abierta,
  onAbrir,
  onDragStart,
  onCambio,
  onError,
}: {
  item: Row;
  espera: Row | undefined;
  moviendo: boolean;
  bloqueado: boolean;
  abierta: boolean;
  onAbrir: () => void;
  onDragStart: () => void;
  onCambio: () => void;
  onError: (m: string) => void;
}) {
  const d = (item.delay ?? {}) as Record<string, number>;
  const expuesto = Number(d.exposed_over ?? 0);
  const tdx = Number(d.tdx_days ?? 0);
  const cli = Number(d.cliente_days ?? 0);
  const total = tdx + cli + Number(d.tercero_days ?? 0);
  const miembros = (item.members ?? []) as Row[];
  const listos = Number(item.members_done ?? 0);

  const borde = expuesto > 0
    ? 'border-destructive bg-destructive/5'
    : espera
      ? 'border-l-4 border-l-violet-500'
      : '';

  return (
    <div
      draggable={!bloqueado && !moviendo}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.id));
        onDragStart();
      }}
      className={`rounded border bg-background p-2 text-xs ${borde} ${
        bloqueado ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <button type="button" onClick={onAbrir} className="w-full text-left">
        <p className="mb-1.5 font-medium leading-snug">{String(item.title)}</p>
        <div className="flex flex-wrap items-center gap-1">
          {item.effort_size ? (
            <Badge variant="outline" className="text-[9px]">
              {String(item.effort_size)} · {String(item.effort_points ?? 0)}cr
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px]">
              sin estimar
            </Badge>
          )}
          {miembros.length ? (
            <Badge
              variant={listos === miembros.length ? 'secondary' : 'outline'}
              className="text-[9px]"
            >
              <Users className="mr-0.5 inline h-2.5 w-2.5" />
              {listos} de {miembros.length}
            </Badge>
          ) : null}
          {expuesto > 0 ? (
            <Badge variant="destructive" className="text-[9px]">
              +{expuesto}d
            </Badge>
          ) : null}
          {espera ? (
            <Badge variant="outline" className="border-violet-400 text-[9px]">
              esperando {String(espera.waiting_days)}d
            </Badge>
          ) : null}
        </div>
      </button>

      {/* El ancho es tiempo real: con total 0 no se dibuja nada. */}
      {total > 0 ? (
        <div className="mt-1.5">
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
        </div>
      ) : null}

      {moviendo ? (
        <p className="text-muted-foreground mt-1 text-[10px]">
          <Loader2 className="mr-1 inline h-2.5 w-2.5 animate-spin" />
          moviendo…
        </p>
      ) : null}

      {abierta ? (
        <PanelTarjeta
          item={item}
          espera={espera}
          miembros={miembros}
          bloqueado={bloqueado}
          onCambio={onCambio}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El panel: miembros, esperas y el historial de fases
// ---------------------------------------------------------------------------

function PanelTarjeta({
  item,
  espera,
  miembros,
  bloqueado,
  onCambio,
  onError,
}: {
  item: Row;
  espera: Row | undefined;
  miembros: Row[];
  bloqueado: boolean;
  onCambio: () => void;
  onError: (m: string) => void;
}) {
  const [tramos, setTramos] = useState<Row[] | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [que, setQue] = useState('');
  const [quien, setQuien] = useState<'cliente' | 'tercero' | 'tdx'>('cliente');
  const [motivo, setMotivo] = useState<string>('espera_cliente_validacion');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void phaseSlaAction(String(item.id)).then((r) => {
      if (vivo) setTramos((r.data as Row[]) ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [item.id]);

  async function abrirEspera() {
    if (!que.trim()) return;
    setGuardando(true);
    const r = await openWaitAction({
      ticket_id: String(item.id),
      what: que.trim(),
      owed_by: quien,
      reason: motivo as never,
    });
    setGuardando(false);
    if (r.error) onError(r.error);
    else {
      setQue('');
      setAbriendo(false);
      onCambio();
    }
  }

  async function cerrarEspera() {
    if (!espera) return;
    setGuardando(true);
    const r = await closeWaitAction({ wait_id: String(espera.wait_id) });
    setGuardando(false);
    if (r.error) onError(r.error);
    else onCambio();
  }

  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <p className="text-muted-foreground font-mono text-[9px]">
        {String(item.ticket_number)} · {String(item.status)}
      </p>

      {miembros.length ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-medium">
            Tickets que agrupa
          </p>
          {miembros.map((m) => (
            <div key={String(m.member_id)} className="flex items-center gap-1.5 text-[10px]">
              <span className={m.member_done ? 'text-emerald-600' : 'text-muted-foreground'}>
                {m.member_done ? '✓' : '○'}
              </span>
              <span className="min-w-0 flex-1 truncate">{String(m.member_title)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* La espera: lo que pausa el reloj */}
      {espera ? (
        <div className="rounded border border-violet-400/50 bg-violet-50 p-1.5 dark:bg-violet-950/20">
          <p className="text-[10px] font-medium">{String(espera.what)}</p>
          <p className="text-muted-foreground text-[9px]">
            {String(espera.waiting_days)} días · a cargo de{' '}
            {OWNER_LABEL[String(espera.owed_by)] ?? String(espera.owed_by)}
          </p>
          {!bloqueado ? (
            <Button
              size="sm"
              className="mt-1.5 h-6 w-full text-[10px]"
              onClick={() => void cerrarEspera()}
              disabled={guardando}
            >
              Ya llegó
            </Button>
          ) : null}
        </div>
      ) : abriendo ? (
        <div className="space-y-1.5 rounded border p-1.5">
          <Input
            value={que}
            onChange={(e) => setQue(e.target.value)}
            placeholder="Qué se está esperando"
            className="h-7 text-[11px]"
            autoFocus
          />
          <Select value={quien} onValueChange={(v) => setQuien(v as typeof quien)}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cliente" className="text-xs">Del cliente</SelectItem>
              <SelectItem value="tercero" className="text-xs">De un tercero</SelectItem>
              <SelectItem value="tdx" className="text-xs">De TDX</SelectItem>
            </SelectContent>
          </Select>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS.map((m) => (
                <SelectItem key={m.v} value={m.v} className="text-xs">
                  {m.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-6 flex-1 text-[10px]"
              onClick={() => void abrirEspera()}
              disabled={guardando}
            >
              Registrar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => setAbriendo(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : !bloqueado ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-full text-[10px]"
          onClick={() => setAbriendo(true)}
        >
          Esperando algo…
        </Button>
      ) : null}

      {/* El historial: para auditar la cifra en vez de creérsela */}
      {tramos && tramos.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-medium">Fases</p>
          {tramos.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px]">
              <span className="text-muted-foreground w-20 shrink-0 truncate">
                {String(t.phase)}
              </span>
              <span className="font-mono">{String(t.net_days ?? '—')}d</span>
              {t.target_days ? (
                <span
                  className={
                    t.breached ? 'text-destructive font-medium' : 'text-muted-foreground'
                  }
                >
                  / {String(t.target_days)}d
                </span>
              ) : (
                <span className="text-muted-foreground">sin plazo</span>
              )}
              {t.is_open ? <CheckCircle2 className="h-2.5 w-2.5 text-sky-600" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
