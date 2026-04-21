'use client';

import { useState, useTransition } from 'react';

import { submitNpsResponse } from './actions';

const SCALE = Array.from({ length: 11 }, (_, i) => i);

function colorForScore(score: number): string {
  if (score <= 6) return 'bg-red-500 hover:bg-red-600';
  if (score <= 8) return 'bg-amber-500 hover:bg-amber-600';
  return 'bg-emerald-500 hover:bg-emerald-600';
}

export function NpsSurveyForm({
  token,
  initialScore,
}: {
  token: string;
  initialScore: number | null;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (score === null) {
      setError('Elige una calificación del 0 al 10.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await submitNpsResponse({ token, score, comment });
      if (!res.ok) {
        setError(res.error ?? 'No se pudo enviar');
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        <p className="font-semibold">¡Gracias por tu respuesta!</p>
        <p className="mt-1 text-sm">Tu feedback nos ayuda a mejorar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          En una escala del 0 al 10, ¿qué tan probable es que recomiendes
          nuestro servicio a un colega?
        </p>
        <div className="flex flex-wrap justify-between gap-1.5">
          {SCALE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={[
                'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white transition-transform',
                colorForScore(n),
                score === n ? 'scale-110 ring-2 ring-offset-2 ring-indigo-500' : 'opacity-80',
              ].join(' ')}
              aria-label={`Calificar con ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-gray-400">
          <span>Nada probable</span>
          <span>Totalmente probable</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="nps-comment"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Cuéntanos por qué (opcional)
        </label>
        <textarea
          id="nps-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={4}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          placeholder="¿Qué hicimos bien? ¿En qué podemos mejorar?"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || score === null}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700"
      >
        {pending ? 'Enviando…' : 'Enviar respuesta'}
      </button>
    </div>
  );
}
