'use client';

import Link from 'next/link';

import { BookOpen, TicketIcon, User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PortalHeaderProps {
  orgName: string;
  orgLogo?: string | null;
  orgColors?: { primary?: string; accent?: string } | null;
  userName?: string | null;
  userAvatar?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PortalHeader({
  orgName,
  orgLogo,
  orgColors,
  userName,
  userAvatar,
}: PortalHeaderProps) {
  const accentColor = orgColors?.primary ?? '#4f46e5';

  const initials = orgName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4">
        {/* Left: Logo + Org name */}
        <Link href="/portal" className="flex items-center gap-2.5">
          {orgLogo ? (
            <img
              src={orgLogo}
              alt={orgName}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {initials}
            </div>
          )}
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {orgName}
          </span>
        </Link>

        {/* Center: Nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/portal/kb"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <BookOpen className="h-4 w-4" />
            Base de Conocimiento
          </Link>
          <Link
            href="/portal/tickets"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <TicketIcon className="h-4 w-4" />
            Mis Tickets
          </Link>
        </nav>

        {/* Right: User avatar */}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            {userAvatar && <AvatarImage src={userAvatar} alt={userName ?? ''} />}
            <AvatarFallback className="bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {userName
                ? userName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          {userName && (
            <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-300 md:block">
              {userName}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
