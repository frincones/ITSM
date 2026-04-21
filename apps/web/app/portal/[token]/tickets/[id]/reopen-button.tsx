'use client';

import { useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@kit/ui/button';

import { reopenTicketFromPortal } from './actions';

export function ReopenButton({
  token,
  ticketId,
  email,
}: {
  token: string;
  ticketId: string;
  email?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await reopenTicketFromPortal({ token, ticketId, email });
      if (!res.ok) {
        setError(res.error ?? 'No se pudo reabrir');
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        ✓ Ticket reabierto. Un agente lo retomará pronto.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handleClick}
        className="gap-2"
      >
        <RotateCcw className="h-4 w-4" />
        {pending ? 'Reabriendo…' : 'Reabrir ticket'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
