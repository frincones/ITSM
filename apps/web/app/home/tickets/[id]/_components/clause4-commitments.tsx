'use client';

import { useState, useTransition } from 'react';

import { AlertTriangle, CalendarClock, Check, ShieldAlert } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Textarea } from '@kit/ui/textarea';

import {
  recordCorrectionPlan,
  recordMitigation,
} from '~/lib/actions/tickets';

/**
 * The two commitments clause 4 of the support contract carries beyond the
 * response-time SLA:
 *
 *   · P0      → mitigation or temporary solution by the close of the same
 *               business day
 *   · P0 + P1 → a correction plan WITH a committed date
 *
 * Both are *recorded*, never inferred from status changes — a status change is
 * not a promise made to a client. The note on each is the evidence that the
 * commitment was actually communicated, which is what we would have to produce
 * if the client disputed it.
 */

export interface Clause4Props {
  ticketId: string;
  urgency: string;
  mitigationDueAt: string | null;
  mitigationAt: string | null;
  mitigationNote: string | null;
  correctionPlanAt: string | null;
  correctionCommittedDate: string | null;
  correctionPlanNote: string | null;
  /** Client users see the state but cannot record TDX's commitments. */
  readOnly?: boolean;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function Clause4Commitments({
  ticketId,
  urgency,
  mitigationDueAt,
  mitigationAt,
  mitigationNote,
  correctionPlanAt,
  correctionCommittedDate,
  correctionPlanNote,
  readOnly = false,
}: Clause4Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [mitigationText, setMitigationText] = useState('');
  const [planDate, setPlanDate] = useState(correctionCommittedDate ?? '');
  const [planText, setPlanText] = useState('');

  const owesCorrectionPlan = ['critical', 'high'].includes(urgency);

  // No mitigation deadline and no correction-plan duty means this ticket
  // carries neither commitment — render nothing rather than an empty panel.
  if (!mitigationDueAt && !owesCorrectionPlan) return null;

  const mitigationLate =
    !!mitigationDueAt &&
    !mitigationAt &&
    new Date(mitigationDueAt).getTime() < Date.now();

  const mitigationMissedDeadline =
    !!mitigationDueAt &&
    !!mitigationAt &&
    new Date(mitigationAt).getTime() > new Date(mitigationDueAt).getTime();

  function submitMitigation() {
    setError(null);
    startTransition(async () => {
      const res = await recordMitigation(ticketId, mitigationText);
      if (res.error) setError(res.error);
      else setMitigationText('');
    });
  }

  function submitPlan() {
    setError(null);
    startTransition(async () => {
      const res = await recordCorrectionPlan(ticketId, planDate, planText);
      if (res.error) setError(res.error);
      else setPlanText('');
    });
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Compromisos del contrato (cl. 4)
      </h3>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {/* ── P0 mitigation ─────────────────────────────────────────── */}
      {mitigationDueAt && (
        <div
          className={`mb-3 rounded-lg border p-3 ${
            mitigationAt && !mitigationMissedDeadline
              ? 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'
              : mitigationLate || mitigationMissedDeadline
                ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
                : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            {mitigationAt && !mitigationMissedDeadline ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            )}
            <span className="text-sm font-medium">
              Mitigación / solución temporal
            </span>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400">
            Vence: {formatDateTime(mitigationDueAt)} (cierre de la jornada hábil)
          </p>

          {mitigationAt ? (
            <>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                Entregada: {formatDateTime(mitigationAt)}
                {mitigationMissedDeadline && ' — fuera de plazo'}
              </p>
              {mitigationNote && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                  {mitigationNote}
                </p>
              )}
            </>
          ) : readOnly ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Pendiente
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {mitigationLate && (
                <p className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Plazo vencido — regístrala igual para dejar constancia
                </p>
              )}
              <Textarea
                value={mitigationText}
                onChange={(e) => setMitigationText(e.target.value)}
                placeholder="Qué se entregó al cliente como mitigación o solución temporal"
                rows={2}
              />
              <Button
                size="sm"
                disabled={pending || !mitigationText.trim()}
                onClick={submitMitigation}
              >
                Registrar mitigación
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── P0/P1 correction plan ─────────────────────────────────── */}
      {owesCorrectionPlan && (
        <div
          className={`rounded-lg border p-3 ${
            correctionPlanAt
              ? 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'
              : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            {correctionPlanAt ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <CalendarClock className="h-4 w-4 text-amber-600" />
            )}
            <span className="text-sm font-medium">
              Plan de corrección con fecha comprometida
            </span>
          </div>

          {correctionPlanAt ? (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Comprometida: <strong>{correctionCommittedDate}</strong>
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Registrado: {formatDateTime(correctionPlanAt)}
              </p>
              {correctionPlanNote && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                  {correctionPlanNote}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Debe comunicarse dentro del mismo plazo de respuesta del SLA.
            </p>
          )}

          {!readOnly && (
            <div className="mt-2 space-y-2">
              <Input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
              />
              <Textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                placeholder="Plan de corrección comunicado al cliente"
                rows={2}
              />
              <Button
                size="sm"
                variant={correctionPlanAt ? 'outline' : 'default'}
                disabled={pending || !planDate || !planText.trim()}
                onClick={submitPlan}
              >
                {correctionPlanAt
                  ? 'Actualizar plan'
                  : 'Registrar plan de corrección'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
