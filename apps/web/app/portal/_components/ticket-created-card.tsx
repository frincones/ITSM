'use client';

import Link from 'next/link';

import { CheckCircle, ExternalLink } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TicketCreatedCardProps {
  ticketId: string;
  ticketNumber: string;
  title: string;
  type?: string;
  urgency?: string;
  orgName?: string;
  portalToken?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function urgencyColor(urgency?: string) {
  switch (urgency?.toLowerCase()) {
    case 'critica':
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'alta':
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'media':
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
}

function typeColor(type?: string) {
  switch (type?.toLowerCase()) {
    case 'incidente':
    case 'incident':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'solicitud':
    case 'request':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TicketCreatedCard({
  ticketId,
  ticketNumber,
  title,
  type,
  urgency,
  orgName,
  portalToken,
}: TicketCreatedCardProps) {
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-green-200 bg-white dark:border-green-800/50 dark:bg-gray-900">
      {/* Green left accent */}
      <div className="flex">
        <div className="w-1 flex-shrink-0 bg-green-500" />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Ticket creado exitosamente
            </span>
          </div>

          {/* Details */}
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                #{ticketNumber}
              </span>
              {type && (
                <Badge variant="secondary" className={`text-[10px] ${typeColor(type)}`}>
                  {type}
                </Badge>
              )}
              {urgency && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${urgencyColor(urgency)}`}
                >
                  {urgency}
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {title}
            </p>
            {orgName && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {orgName}
              </p>
            )}
          </div>

          {/* Action */}
          <Link href={portalToken ? `/portal/${portalToken}/tickets/${ticketId}` : `/portal/tickets/${ticketId}`}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              Ver mi ticket
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
