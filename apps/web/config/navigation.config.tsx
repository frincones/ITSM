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
} from 'lucide-react';
import { z } from 'zod';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const routes = [
  {
    label: 'common:routes.application',
    children: [
      {
        label: 'common:routes.home',
        path: pathsConfig.app.home,
        Icon: <LayoutDashboard className={iconClasses} />,
        end: true,
      },
      {
        label: 'common:routes.inbox',
        path: '/home/inbox',
        Icon: <Inbox className={iconClasses} />,
      },
      {
        label: 'common:routes.tickets',
        path: '/home/tickets',
        Icon: <Ticket className={iconClasses} />,
      },
      {
        label: 'common:routes.problems',
        path: '/home/problems',
        Icon: <AlertTriangle className={iconClasses} />,
      },
      {
        label: 'common:routes.changes',
        path: '/home/changes',
        Icon: <GitBranch className={iconClasses} />,
      },
      {
        label: 'common:routes.projects',
        path: '/home/projects',
        Icon: <FolderKanban className={iconClasses} />,
      },
      {
        label: 'common:routes.assets',
        path: '/home/assets',
        Icon: <Monitor className={iconClasses} />,
      },
      {
        label: 'common:routes.knowledge',
        path: '/home/kb',
        Icon: <BookOpen className={iconClasses} />,
      },
      {
        label: 'common:routes.catalog',
        path: '/home/service-catalog',
        Icon: <ShoppingBag className={iconClasses} />,
      },
      {
        label: 'common:routes.automations',
        path: '/home/automations',
        Icon: <Workflow className={iconClasses} />,
      },
      {
        label: 'common:routes.reports',
        path: '/home/reports',
        Icon: <BarChart3 className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.settings',
    children: [
      {
        label: 'common:routes.profile',
        path: pathsConfig.app.profileSettings,
        Icon: <Settings className={iconClasses} />,
      },
    ],
  },
] satisfies z.infer<typeof NavigationConfigSchema>['routes'];

export const navigationConfig = NavigationConfigSchema.parse({
  routes,
  style: process.env.NEXT_PUBLIC_NAVIGATION_STYLE,
  sidebarCollapsed: process.env.NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED,
});
