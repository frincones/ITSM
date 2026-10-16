'use client';

// ---------------------------------------------------------------------------
// Agrupar tickets en un requerimiento facturable
// ---------------------------------------------------------------------------
// El diálogo de la reunión de refinement: el PM elige varios tickets del
// backlog y los convierte en un entregable con una talla y unos créditos.
//
// La pieza que no puede faltar es el aviso de cuota. Un miembro de tipo
// support, incident o request seguirá consumiendo cuota de soporte ADEMÁS de
// que su trabajo cuente en los créditos del entregable — el mismo trabajo en
// dos contadores. Es una decisión deliberada del equipo (para que planificar
// no sea reclasificar), pero el PM debería verla antes de confirmar: es un
// peso en la factura.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

import { AlertTriangle, Layers, Loader2 } from 'lucide-react';

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

import { groupTicketsAction, quotaImpactAction } from '~/lib/actions/delivery';

const TALLAS = ['S', 'M', 'L', 'XL'] as const;
type Talla = (typeof TALLAS)[number];

interface Seleccionado {
  id: string;
  ticket_number: string;
  title: string;
  type: string;
}

interface Props {
  seleccionados: Seleccionado[];
  scale: Record<string, number>;
  cycles: Array<{ id: string; cycle_number: number; name: string | null; status: string }>;
  cycleIdSugerido: string | null;
  projectId: string | null;
  onCancelar: () => void;
  onListo: () => void;
}

export function GroupDialog(props: Props) {
  const [titulo, setTitulo] = useState('');
  const [talla, setTalla] = useState<Talla>('M');
  const [cycleId, setCycleId] = useState<string | null>(props.cycleIdSugerido);
  const [cuota, setCuota] = useState<{ consumes: number; types: string[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = props.seleccionados.map((s) => s.id);

  // El impacto en cuota se consulta a la base y no se deduce aquí: la regla
  // de qué tipo consume cuota vive en ticket_type_consumes_quota().
  useEffect(() => {
    let vigente = true;
    void quotaImpactAction(ids).then((r) => {
      if (!vigente) return;
      const d = r.data as { consumes: number; types: string[] } | null;
      setCuota(d ? { consumes: d.consumes, types: d.types } : null);
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  const abiertos = props.cycles.filter((c) => c.status !== 'closed');
  const creditos = props.scale[talla];

  async function confirmar() {
    if (!titulo.trim()) {
      setError('El requerimiento necesita un nombre');
      return;
    }
    setGuardando(true);
    setError(null);

    const r = await groupTicketsAction({
      child_ids: ids,
      title: titulo.trim(),
      size: talla,
      cycle_id: cycleId,
      project_id: props.projectId,
    });

    setGuardando(false);
    if (r.error) setError(r.error);
    else props.onListo();
  }

  return (
    <Card className="border-violet-400/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4" />
        <h3 className="text-sm font-semibold">
          Agrupar {props.seleccionados.length} tickets en un requerimiento
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Nombre del requerimiento</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="R1 · Capa de filtros"
            autoFocus
          />
          <p className="text-muted-foreground mt-1 text-[11px]">
            El nombre del entregable, no el de uno de sus tickets.
          </p>
        </div>

        <div>
          <Label className="text-xs">Talla del entregable</Label>
          <Select value={talla} onValueChange={(v) => setTalla(v as Talla)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TALLAS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t} · {props.scale[t] ?? '?'} créditos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {creditos !== undefined
              ? `El ciclo contará ${creditos} crédito(s), no ${props.seleccionados.length}.`
              : 'Sin escala vigente para esta talla.'}
          </p>
        </div>

        <div>
          <Label className="text-xs">Ciclo</Label>
          <Select
            value={cycleId ?? 'none'}
            onValueChange={(v) => setCycleId(v === 'none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin ciclo</SelectItem>
              {abiertos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name ?? `Ciclo ${c.cycle_number}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Los tickets que van dentro, para que se vea qué se está agrupando. */}
      <div className="mt-3 max-h-32 overflow-y-auto rounded border p-2">
        {props.seleccionados.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-0.5 text-xs">
            <span className="text-muted-foreground font-mono">{s.ticket_number}</span>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            <Badge variant="outline" className="text-[10px]">
              {s.type}
            </Badge>
          </div>
        ))}
      </div>

      {/* EL AVISO. Sin esto, el doble conteo aparece en una factura. */}
      {cuota && cuota.consumes > 0 ? (
        <div className="mt-3 flex gap-2 rounded border border-amber-500/50 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">
              {cuota.consumes} de {props.seleccionados.length} tickets seguirán consumiendo
              cuota de soporte
            </p>
            <p className="text-muted-foreground mt-1">
              Son de tipo {cuota.types.join(', ')}. Al agrupar conservan su tipo, así que
              contarán en la cuota mensual <strong>además</strong> de los{' '}
              {creditos ?? '—'} créditos de este entregable. Si es trabajo de desarrollo y
              no soporte, conviene reclasificarlos antes.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive mt-3 text-xs">{error}</p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => void confirmar()} disabled={guardando}>
          {guardando ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Crear requerimiento
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancelar} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
