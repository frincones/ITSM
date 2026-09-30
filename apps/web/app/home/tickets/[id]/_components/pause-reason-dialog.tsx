'use client';

import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Button } from '@kit/ui/button';
import { Label } from '@kit/ui/label';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';

import type { SlaPauseReason } from '~/lib/services/support-contract.service';

/**
 * Asks why the SLA clock should pause, for the statuses where the contract
 * does not settle it on its own.
 *
 * `pending` and `testing` never reach this dialog: waiting on the client for
 * information or validation is unambiguous, so the trigger infers those (see
 * migration 00048) and the agent is not asked to justify the obvious.
 *
 * The point of showing which options stop the clock and which do not is that
 * pausing is a claim we would have to defend. A ticket parked because we
 * deprioritised it has no contractual basis for freezing the deadline, and the
 * agent should see that as they choose.
 */

const OPTIONS: Array<{
  value: SlaPauseReason;
  label: string;
  hint: string;
  pauses: boolean;
}> = [
  {
    value: 'espera_cliente_info',
    label: 'Esperando información del cliente',
    hint: 'Cláusula 4 — el reloj se suspende',
    pauses: true,
  },
  {
    value: 'espera_cliente_validacion',
    label: 'Esperando validación o aprobación del cliente',
    hint: 'Cláusula 4 — el reloj se suspende',
    pauses: true,
  },
  {
    value: 'dependencia_tercero',
    label: 'Dependencia de un tercero',
    hint: 'Cláusula 4 — el reloj se suspende',
    pauses: true,
  },
  {
    value: 'ventana_mantenimiento',
    label: 'Ventana de mantenimiento acordada',
    hint: 'Cláusula 4 — el reloj se suspende',
    pauses: true,
  },
  {
    value: 'fuerza_mayor',
    label: 'Fuerza mayor',
    hint: 'Cláusula 4 — el reloj se suspende',
    pauses: true,
  },
  {
    value: 'priorizacion_interna',
    label: 'Priorización interna de TDX',
    hint: 'Sin respaldo contractual — el reloj SIGUE corriendo',
    pauses: false,
  },
];

const STATUS_LABELS: Record<string, string> = {
  detenido: 'Detenido',
  backlog: 'Backlog',
  esperando_ventana: 'Esperando ventana',
};

export interface PauseReasonDialogProps {
  /** The status being moved to, or null when the dialog is closed. */
  targetStatus: string | null;
  onCancel: () => void;
  onConfirm: (reason: SlaPauseReason) => void;
}

export function PauseReasonDialog({
  targetStatus,
  onCancel,
  onConfirm,
}: PauseReasonDialogProps) {
  const [reason, setReason] = useState<SlaPauseReason>('espera_cliente_info');

  const open = targetStatus !== null;
  const statusLabel = targetStatus
    ? (STATUS_LABELS[targetStatus] ?? targetStatus)
    : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pasar a {statusLabel}</DialogTitle>
          <DialogDescription>
            Indica por qué se pausa el ticket. Queda registrado en el historial y
            sustenta el cálculo del SLA en el reporte mensual.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={reason}
          onValueChange={(v) => setReason(v as SlaPauseReason)}
          className="gap-3"
        >
          {OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-start gap-3">
              <RadioGroupItem
                value={opt.value}
                id={`pause-${opt.value}`}
                className="mt-1"
              />
              <Label
                htmlFor={`pause-${opt.value}`}
                className="cursor-pointer font-normal"
              >
                <span className="block text-sm">{opt.label}</span>
                <span
                  className={
                    opt.pauses
                      ? 'block text-xs text-gray-500 dark:text-gray-400'
                      : 'block text-xs text-amber-700 dark:text-amber-400'
                  }
                >
                  {opt.hint}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(reason)}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
