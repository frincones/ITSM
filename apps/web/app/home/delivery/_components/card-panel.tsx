'use client';

// ---------------------------------------------------------------------------
// Panel lateral de la tarjeta
// ---------------------------------------------------------------------------
// Panel deslizante en vez de modal centrado, siguiendo lo que hacen Linear y
// Jira: el modal se reserva para lo destructivo, y quien revisa muchos ítems
// seguidos —un PM en refinement— no quiere cerrarlo para pasar al siguiente.
// Por eso las flechas navegan sin cerrar y el tablero sigue visible detrás.
//
// El objetivo es que un requerimiento se gestione como un ticket: checklist,
// comentarios, menciones con @ y adjuntos. Para la conversación se reutiliza
// el ReplyComposer de /home/tickets/[id] en vez de escribir otro — ya trae
// las menciones con su notificación, los adjuntos y las plantillas, y
// duplicarlo dejaría dos sitios donde arreglar el mismo fallo.
//
// El checklist y los comentarios son DEL TICKET que se está viendo: si se
// abre un miembro de un grupo, se ven los suyos.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import { ChevronDown, ChevronRight, Clock, Loader2, Lock, Plus, Trash2, X } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
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
  FollowersPanel,
  type FollowerRow,
} from '../../tickets/[id]/_components/followers-panel';
import { ReplyComposer } from '../../tickets/[id]/_components/reply-composer';
import {
  cardDetailAction,
  closeWaitAction,
  deleteTaskAction,
  openWaitAction,
  setPhaseAction,
  toggleTaskAction,
} from '~/lib/actions/delivery';
import { addTask, assignTicket, changeTicketStatus } from '~/lib/actions/tickets';

type Row = Record<string, unknown>;

const FASES = [
  { v: 'levantamiento', l: 'Levantamiento' },
  { v: 'documentacion', l: 'Documentación' },
  { v: 'accesos', l: 'Accesos' },
  { v: 'desarrollo', l: 'Desarrollo' },
  { v: 'uat', l: 'UAT' },
  { v: 'despliegue', l: 'Despliegue' },
  { v: 'entregado', l: 'Entregado' },
  { v: 'descartado', l: 'Descartado' },
] as const;

const MOTIVOS = [
  { v: 'espera_cliente_info', l: 'Información del cliente' },
  { v: 'espera_cliente_validacion', l: 'Validación o aprobación' },
  { v: 'dependencia_tercero', l: 'Dependencia de un tercero' },
  { v: 'ventana_mantenimiento', l: 'Ventana de mantenimiento' },
  { v: 'fuerza_mayor', l: 'Fuerza mayor' },
  { v: 'priorizacion_interna', l: 'Prioridad interna (no pausa)' },
] as const;

const OWNER: Record<string, string> = {
  tdx: 'TDX',
  cliente: 'Cliente',
  tercero: 'Tercero',
  ninguno: '—',
};

const cuando = (iso: unknown) => {
  if (!iso) return '';
  const h = Math.round((Date.now() - new Date(String(iso)).getTime()) / 36e5);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

interface Props {
  ticketId: string;
  /** Para pasar al siguiente sin cerrar: el motivo de elegir panel. */
  hermanos: Array<{ id: string; title: string }>;
  bloqueado: boolean;
  onCerrar: () => void;
  onIr: (id: string) => void;
  onCambio: () => void;
}

export function CardPanel(props: Props) {
  const [d, setD] = useState<Row | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verActividad, setVerActividad] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await cardDetailAction(props.ticketId);
    if (r.error) setError(r.error);
    else setD(r.data as Row);
    setCargando(false);
  }, [props.ticketId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCerrar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);

  const idx = props.hermanos.findIndex((h) => h.id === props.ticketId);
  const t = (d?.ticket ?? {}) as Row;
  const tareas = (d?.tasks ?? []) as Row[];
  const comentarios = (d?.comments ?? []) as Row[];
  const miembros = (d?.members ?? []) as Row[];
  const fases = (d?.phases ?? []) as Row[];
  const esperas = (d?.waits ?? []) as Row[];
  const abierta = esperas.find((w) => !w.received_at);
  const tramo = fases.find((f) => f.is_open);
  const seguidores = (d?.followers ?? []) as FollowerRow[];
  const plantel = (d?.agents ?? []) as Array<{
    id: string;
    name: string;
    email?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  }>;
  // Si el ticket es parte de un grupo, el plazo no es suyo: es del padre.
  // Decirlo aquí evita que alguien lea el panel y crea que va retrasado.
  const padre = (d?.parent ?? null) as Row | null;

  async function refrescar() {
    await cargar();
    props.onCambio();
  }

  return (
    <>
      {/* El velo deja ver el tablero: el panel lo acompaña, no lo sustituye */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={props.onCerrar} aria-hidden />

      <aside
        className="bg-background fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l shadow-2xl"
        role="dialog"
        aria-label="Detalle del requerimiento"
      >
        <header className="flex items-start gap-2 border-b p-4">
          <div className="min-w-0 flex-1">
            {padre ? (
              <p className="text-muted-foreground mb-0.5 truncate text-[11px]">
                ↳ parte de{' '}
                <button
                  type="button"
                  onClick={() => props.onIr(String(padre.id))}
                  className="hover:text-foreground underline"
                >
                  {String(padre.title ?? '')}
                </button>
              </p>
            ) : null}
            <p className="text-muted-foreground font-mono text-[11px]">
              {String(t.ticket_number ?? '')}
            </p>
            <h2 className="mt-0.5 text-base font-semibold leading-snug">
              {String(t.title ?? '')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={String(t.requirement_phase ?? '')}
                disabled={props.bloqueado || guardando}
                onValueChange={async (v) => {
                  setGuardando(true);
                  const r = await setPhaseAction(props.ticketId, v as never);
                  setGuardando(false);
                  if (r.error) setError(r.error);
                  else await refrescar();
                }}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder="Sin fase" />
                </SelectTrigger>
                <SelectContent>
                  {FASES.map((f) => (
                    <SelectItem key={f.v} value={f.v} className="text-xs">
                      {f.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {t.effort_size && !padre ? (
                <Badge variant="outline" className="text-[10px]">
                  {String(t.effort_size)} · {String(t.effort_points ?? 0)}cr
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[10px]">
                {String(t.status ?? '')}
              </Badge>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={idx <= 0}
              onClick={() => props.onIr(props.hermanos[idx - 1]!.id)}
              aria-label="Anterior"
            >
              ↑
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={idx < 0 || idx >= props.hermanos.length - 1}
              onClick={() => props.onIr(props.hermanos[idx + 1]!.id)}
              aria-label="Siguiente"
            >
              ↓
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={props.onCerrar}
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {cargando && !d ? (
            <div className="text-muted-foreground p-8 text-center text-sm">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Cargando…
            </div>
          ) : (
            <div className="space-y-5 p-4">
              {error ? (
                <p className="text-destructive bg-destructive/5 rounded border p-2 text-xs">
                  {error}
                </p>
              ) : null}

              {/* Responsable y seguidores. Es lo que hace falta para repartir
                  un entregable entre dos desarrolladores: cada ticket se
                  asigna por su cuenta.

                  assignTicket() ya notifica al nuevo responsable y conserva
                  al anterior como seguidor — se reusa tal cual en vez de
                  escribir otra asignación, porque duplicarla dejaría dos
                  sitios donde arreglar el mismo fallo. */}
              <section className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground w-24 shrink-0 text-xs">
                    Responsable
                  </Label>
                  <Select
                    value={String(t.assigned_agent_id ?? '__nadie')}
                    disabled={props.bloqueado || guardando}
                    onValueChange={async (v) => {
                      setGuardando(true);
                      const r = await assignTicket(
                        props.ticketId,
                        v === '__nadie' ? null : v,
                      );
                      setGuardando(false);
                      if (r.error) setError(r.error);
                      else await refrescar();
                    }}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nadie" className="text-xs">
                        Sin asignar
                      </SelectItem>
                      {plantel.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-3 border-t pt-3">
                  <FollowersPanel
                    ticketId={props.ticketId}
                    initialFollowers={seguidores}
                    currentAgentId={(d?.current_agent_id as string | null) ?? null}
                    agents={plantel}
                  />
                </div>
              </section>

              {/* El reloj. Solo se pinta si el plazo es de ESTE ticket: en un
                  miembro de un grupo el plazo del Anexo C es del entregable,
                  y mostrar aquí un semáforo haría parecer que hay dos. */}
              {padre ? (
                <section className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs leading-relaxed">
                  El plazo de contrato lo lleva el entregable{' '}
                  <button
                    type="button"
                    onClick={() => props.onIr(String(padre.id))}
                    className="hover:text-foreground font-medium underline"
                  >
                    {String(padre.title ?? '')}
                  </button>
                  {padre.effort_size
                    ? ` (${String(padre.effort_size)} · ${String(padre.effort_points ?? 0)}cr)`
                    : ''}
                  . Este ticket se mueve de fase y se asigna por su cuenta, pero sus días
                  no se cuentan aparte.
                </section>
              ) : null}

              {tramo && !padre ? (
                <section className="rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {FASES.find((f) => f.v === tramo.phase)?.l ?? String(tramo.phase)}
                    </p>
                    <span className="text-muted-foreground text-xs">
                      a cargo de {OWNER[String(tramo.owner)] ?? '—'}
                    </span>
                  </div>

                  {tramo.target_days ? (
                    <>
                      <div className="bg-muted mt-2 h-2 overflow-hidden rounded">
                        <div
                          className={`h-full ${tramo.breached ? 'bg-destructive' : 'bg-sky-600'}`}
                          style={{
                            width: `${Math.min(
                              (Number(tramo.net_days ?? 0) / Number(tramo.target_days)) * 100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {String(tramo.net_days ?? 0)} de {String(tramo.target_days)} días
                        hábiles
                        {Number(tramo.paused_days ?? 0) > 0
                          ? ` · ${String(tramo.paused_days)} en espera`
                          : ''}
                        {tramo.breached ? ' · plazo superado' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      Esta fase no tiene plazo definido.
                    </p>
                  )}

                  <Espera
                    abierta={abierta}
                    ticketId={props.ticketId}
                    bloqueado={props.bloqueado}
                    onCambio={() => void refrescar()}
                    onError={setError}
                  />
                </section>
              ) : null}

              {miembros.length ? (
                <section>
                  <h3 className="mb-2 flex items-baseline justify-between text-sm font-medium">
                    Tickets de este entregable
                    <span className="text-muted-foreground text-xs">
                      {miembros.filter((m) => m.member_done).length} de {miembros.length} listos
                    </span>
                  </h3>
                  <div className="divide-y rounded-lg border">
                    {miembros.map((m) => (
                      <div key={String(m.member_id)} className="flex items-center gap-2 p-2 text-xs">
                        <span className={m.member_done ? 'text-emerald-600' : 'text-muted-foreground'}>
                          {m.member_done ? '✓' : '○'}
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          onClick={() => props.onIr(String(m.member_id))}
                          title="Abrir este ticket para comentarlo"
                        >
                          {String(m.member_title)}
                        </button>
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {String(m.member_status)}
                        </span>
                        {!m.member_done && !props.bloqueado ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px]"
                            disabled={guardando}
                            onClick={async () => {
                              setGuardando(true);
                              const r = await changeTicketStatus(String(m.member_id), 'closed');
                              setGuardando(false);
                              if (r.error) setError(r.error);
                              else await refrescar();
                            }}
                          >
                            Cerrar
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <Checklist
                ticketId={props.ticketId}
                tareas={tareas}
                bloqueado={props.bloqueado}
                onCambio={() => void cargar()}
                onError={setError}
              />

              <section>
                <h3 className="mb-2 text-sm font-medium">
                  Conversación
                  {comentarios.length ? (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {comentarios.length}
                    </span>
                  ) : null}
                </h3>

                {/* El MISMO compositor que la pantalla de tickets: menciones
                    con @ y su notificación, adjuntos, plantillas y el
                    interruptor de nota interna, sin duplicar nada. */}
                <div className="mb-3">
                  <ReplyComposer ticketId={props.ticketId} />
                </div>

                {comentarios.length ? (
                  <div className="space-y-2.5">
                    {comentarios.map((f) => (
                      <div
                        key={String(f.id)}
                        className={`rounded border p-2.5 text-xs ${
                          f.is_private
                            ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px]">
                          <span className="text-foreground font-medium">
                            {String(f.author_name ?? f.author_type ?? 'Sistema')}
                          </span>
                          · {cuando(f.created_at)}
                          {f.is_private ? (
                            <>
                              <Lock className="h-2.5 w-2.5" />
                              interno
                            </>
                          ) : null}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {String(f.content)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">Sin comentarios todavía.</p>
                )}
              </section>

              {fases.length ? (
                <section>
                  <button
                    type="button"
                    className="text-muted-foreground flex items-center gap-1 text-xs hover:underline"
                    onClick={() => setVerActividad(!verActividad)}
                  >
                    {verActividad ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Actividad ({fases.length} fase{fases.length === 1 ? '' : 's'})
                  </button>

                  {verActividad ? (
                    <div className="mt-2 overflow-x-auto rounded-lg border">
                      <table className="w-full text-[11px]">
                        <thead className="text-muted-foreground">
                          <tr className="border-b">
                            <th className="p-2 text-left font-medium">Fase</th>
                            <th className="p-2 text-left font-medium">A cargo</th>
                            <th className="p-2 text-right font-medium">Netos</th>
                            {/* El plazo es del entregable. En un miembro esta
                                columna pintaría un incumplimiento que el
                                contrato no le imputa. */}
                            {padre ? null : (
                              <th className="p-2 text-right font-medium">Plazo</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {fases.map((f, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2">
                                {FASES.find((x) => x.v === f.phase)?.l ?? String(f.phase)}
                                {f.is_open ? ' (en curso)' : ''}
                              </td>
                              <td className="p-2">{OWNER[String(f.owner)] ?? '—'}</td>
                              <td className="p-2 text-right tabular-nums">
                                {String(f.net_days ?? '—')}d
                              </td>
                              {padre ? null : (
                                <td
                                  className={`p-2 text-right tabular-nums ${
                                    f.breached ? 'text-destructive font-medium' : ''
                                  }`}
                                >
                                  {f.target_days ? `${String(f.target_days)}d` : 'sin plazo'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------

function Espera({
  abierta,
  ticketId,
  bloqueado,
  onCambio,
  onError,
}: {
  abierta: Row | undefined;
  ticketId: string;
  bloqueado: boolean;
  onCambio: () => void;
  onError: (m: string) => void;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [que, setQue] = useState('');
  const [quien, setQuien] = useState<'cliente' | 'tercero' | 'tdx'>('cliente');
  const [motivo, setMotivo] = useState('espera_cliente_validacion');
  const [ocupado, setOcupado] = useState(false);

  if (abierta) {
    const dias = Math.max(
      0,
      Math.round((Date.now() - new Date(String(abierta.requested_at)).getTime()) / 864e5),
    );
    return (
      <div className="mt-3 rounded border border-violet-400/60 bg-violet-50 p-2.5 dark:bg-violet-950/20">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Clock className="h-3.5 w-3.5" />
          {String(abierta.what)}
        </p>
        <p className="text-muted-foreground mt-1 text-[11px]">
          {dias} día(s) · a cargo de {OWNER[String(abierta.owed_by)] ?? String(abierta.owed_by)}
          {abierta.owed_by_name ? ` (${String(abierta.owed_by_name)})` : ''}
        </p>
        {!bloqueado ? (
          <Button
            size="sm"
            className="mt-2 h-7 text-xs"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              const r = await closeWaitAction({ wait_id: String(abierta.id) });
              setOcupado(false);
              if (r.error) onError(r.error);
              else onCambio();
            }}
          >
            Ya llegó
          </Button>
        ) : null}
      </div>
    );
  }

  if (bloqueado) return null;

  if (!abriendo) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-3 h-7 text-xs"
        onClick={() => setAbriendo(true)}
      >
        <Clock className="mr-1.5 h-3 w-3" />
        Esperando algo…
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded border p-2.5">
      <div>
        <Label className="text-[11px]">Qué se está esperando</Label>
        <Input
          value={que}
          onChange={(e) => setQue(e.target.value)}
          placeholder="Aprobación del documento funcional"
          className="h-8 text-xs"
          autoFocus
        />
        <p className="text-muted-foreground mt-1 text-[10px]">
          El cliente lee este texto en su portal.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={quien} onValueChange={(v) => setQuien(v as typeof quien)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cliente" className="text-xs">
              Del cliente
            </SelectItem>
            <SelectItem value="tercero" className="text-xs">
              De un tercero
            </SelectItem>
            <SelectItem value="tdx" className="text-xs">
              De TDX
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={motivo} onValueChange={setMotivo}>
          <SelectTrigger className="h-8 text-xs">
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
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={ocupado || !que.trim()}
          onClick={async () => {
            setOcupado(true);
            const r = await openWaitAction({
              ticket_id: ticketId,
              what: que.trim(),
              owed_by: quien,
              reason: motivo as never,
            });
            setOcupado(false);
            if (r.error) onError(r.error);
            else {
              setQue('');
              setAbriendo(false);
              onCambio();
            }
          }}
        >
          Registrar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAbriendo(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Checklist({
  ticketId,
  tareas,
  bloqueado,
  onCambio,
  onError,
}: {
  ticketId: string;
  tareas: Row[];
  bloqueado: boolean;
  onCambio: () => void;
  onError: (m: string) => void;
}) {
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const hechas = tareas.filter((t) => t.status === 'done').length;

  return (
    <section>
      <h3 className="mb-2 flex items-baseline justify-between text-sm font-medium">
        Checklist
        {tareas.length ? (
          <span className="text-muted-foreground text-xs">
            {hechas} de {tareas.length}
          </span>
        ) : null}
      </h3>

      {tareas.length ? (
        <div className="mb-2 space-y-1">
          {tareas.map((t) => (
            <div key={String(t.id)} className="group flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-emerald-600"
                checked={t.status === 'done'}
                disabled={bloqueado || ocupado}
                onChange={async (e) => {
                  setOcupado(true);
                  const r = await toggleTaskAction(String(t.id), e.target.checked);
                  setOcupado(false);
                  if (r.error) onError(r.error);
                  else onCambio();
                }}
              />
              <span
                className={`min-w-0 flex-1 ${
                  t.status === 'done' ? 'text-muted-foreground line-through' : ''
                }`}
              >
                {String(t.title)}
              </span>
              {!bloqueado ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive opacity-0 transition group-hover:opacity-100"
                  aria-label="Borrar paso"
                  onClick={async () => {
                    setOcupado(true);
                    const r = await deleteTaskAction(String(t.id));
                    setOcupado(false);
                    if (r.error) onError(r.error);
                    else onCambio();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mb-2 text-xs">
          Sin pasos todavía. Un checklist sirve para lo que no necesita su propio ticket.
        </p>
      )}

      {!bloqueado ? (
        <form
          className="flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nueva.trim()) return;
            setOcupado(true);
            const r = await addTask(ticketId, { title: nueva.trim() });
            setOcupado(false);
            if (r.error) onError(r.error);
            else {
              setNueva('');
              onCambio();
            }
          }}
        >
          <Input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Añadir un paso"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            type="submit"
            variant="outline"
            className="h-7 px-2"
            disabled={ocupado}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </form>
      ) : null}
    </section>
  );
}
