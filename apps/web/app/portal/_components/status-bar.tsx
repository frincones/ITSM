'use client';

import { AlertTriangle } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface StatusBarProps {
  hasActiveIncident?: boolean;
  incidentMessage?: string;
  openTicketCount?: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function StatusBar({
  hasActiveIncident = false,
  incidentMessage,
  openTicketCount = 0,
}: StatusBarProps) {
  return (
    <div className="border-t border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="mx-auto flex h-8 max-w-5xl items-center justify-between px-4">
        {/* Left: Operational status */}
        <div className="flex items-center gap-2">
          {hasActiveIncident ? (
            <>
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {incidentMessage ?? 'Incidente activo'}
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Todo operativo
              </span>
            </>
          )}
        </div>

        {/* Right: Open ticket count */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {openTicketCount} ticket{openTicketCount !== 1 ? 's' : ''} abierto
            {openTicketCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
