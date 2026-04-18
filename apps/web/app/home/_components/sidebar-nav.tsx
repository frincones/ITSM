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
  { icon: LayoutDashboard, label: 'Dashboard', path: '/home', module: 'dashboard' },
  { icon: Inbox, label: 'Inbox', path: '/home/inbox', module: 'inbox' },
  { icon: Ticket, label: 'Tickets', path: '/home/tickets', module: 'tickets' },
  { icon: AlertTriangle, label: 'Problems', path: '/home/problems', module: 'problems' },
  { icon: GitBranch, label: 'Changes', path: '/home/changes', module: 'changes' },
  { icon: FolderKanban, label: 'Projects', path: '/home/projects', module: 'projects' },
  { icon: Monitor, label: 'Assets', path: '/home/assets', module: 'assets' },
  { icon: BookOpen, label: 'Knowledge', path: '/home/kb', module: 'kb' },
  { icon: ShoppingBag, label: 'Catalog', path: '/home/service-catalog', module: 'service_catalog' },
  { icon: Workflow, label: 'Automations', path: '/home/automations', module: 'automations' },
  { icon: BarChart3, label: 'Reports', path: '/home/reports', module: 'reports' },
];

interface SidebarNavProps {
  allowedModules?: string[] | null;
  isPlatformAdmin?: boolean;
}

export function SidebarNav({
  allowedModules,
  isPlatformAdmin = false,
}: SidebarNavProps = {}) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/home') {
      return pathname === '/home';
    }

    return pathname.startsWith(path);
  };

  // Filter by allowed modules (null = show all = backwards compatible)
  const visibleItems = allowedModules
    ? navItems.filter((item) => allowedModules.includes(item.module))
    : navItems;

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
          {visibleItems.map((item) => (
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

        {/* Settings at bottom — only for platform admins/supervisors */}
        {isPlatformAdmin && (
          <>
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
          </>
        )}
      </TooltipProvider>
    </aside>
  );
}
