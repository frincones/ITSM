'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  LayoutDashboard,
  Inbox,
  Ticket,
  AlertTriangle,
  GitBranch,
  FolderKanban,
  Monitor,
  BookOpen,
  ShoppingBag,
  Workflow,
  BarChart3,
  Settings,
  Wrench,
} from 'lucide-react';

import { cn } from '@kit/ui/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui/tooltip';
import { Separator } from '@kit/ui/separator';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/home' },
  { icon: Inbox, label: 'Inbox', path: '/home/inbox' },
  { icon: Ticket, label: 'Tickets', path: '/home/tickets' },
  { icon: AlertTriangle, label: 'Problems', path: '/home/problems' },
  { icon: GitBranch, label: 'Changes', path: '/home/changes' },
  { icon: FolderKanban, label: 'Projects', path: '/home/projects' },
  { icon: Monitor, label: 'Assets', path: '/home/assets' },
  { icon: BookOpen, label: 'Knowledge', path: '/home/kb' },
  { icon: ShoppingBag, label: 'Catalog', path: '/home/service-catalog' },
  { icon: Workflow, label: 'Automations', path: '/home/automations' },
  { icon: BarChart3, label: 'Reports', path: '/home/reports' },
];

export function SidebarNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/home') {
      return pathname === '/home';
    }

    return pathname.startsWith(path);
  };

  return (
    <aside className="flex w-16 flex-col items-center border-r border-border bg-card py-4">
      {/* Logo */}
      <div className="mb-8">
        <Link href="/home">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Wrench className="h-5 w-5 text-white" />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <Link
                  href={item.path}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                    isActive(item.path)
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* Settings at bottom */}
        <Separator className="my-2 w-8" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/home/settings"
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                isActive('/home/settings')
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Settings className="h-5 w-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Settings
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </aside>
  );
}
