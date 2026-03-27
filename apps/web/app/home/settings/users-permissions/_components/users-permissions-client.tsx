'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Users,
  Building2,
  Key,
  Check,
  X,
  Search,
  Plus,
  Settings,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { Checkbox } from '@kit/ui/checkbox';
import { Switch } from '@kit/ui/switch';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  savePermissions,
  toggleUserActive,
} from '~/lib/actions/user-permissions';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface UnifiedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  profile_id: string | null;
  profile_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  type: 'tdx_agent' | 'org_user';
}

interface Organization {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface ProfilePermission {
  id: string;
  profile_id: string;
  resource: string;
  actions: string[];
  scope: string;
}

interface UsersPermissionsClientProps {
  users: UnifiedUser[];
  organizations: Organization[];
  profiles: Profile[];
  profilePermissions: ProfilePermission[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MODULES = [
  'dashboard',
  'tickets',
  'problems',
  'changes',
  'kb',
  'inbox',
  'reports',
  'assets',
  'projects',
  'service_catalog',
  'automations',
  'workflows',
  'settings',
  'notifications',
  'organizations',
] as const;

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  tickets: 'Tickets',
  problems: 'Problems',
  changes: 'Changes',
  kb: 'Knowledge Base',
  inbox: 'Inbox',
  reports: 'Reports',
  assets: 'Assets',
  projects: 'Projects',
  service_catalog: 'Service Catalog',
  automations: 'Automations',
  workflows: 'Workflows',
  settings: 'Settings',
  notifications: 'Notifications',
  organizations: 'Organizations',
};

const BASE_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

const SPECIAL_ACTIONS: Record<string, string[]> = {
  tickets: ['assign', 'close'],
  changes: ['approve'],
  kb: ['publish'],
  inbox: ['assign', 'resolve'],
  reports: ['export'],
};

const SCOPES = ['own', 'group', 'all'] as const;

type FilterTab = 'all' | 'tdx_agent' | 'org_user';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'supervisor':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'agent':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'manager':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'user':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'readonly':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

/* -------------------------------------------------------------------------- */
/*  Permission State helpers                                                   */
/* -------------------------------------------------------------------------- */

interface PermissionRow {
  resource: string;
  actions: string[];
  scope: 'own' | 'group' | 'all';
}

function buildPermissionState(
  profileId: string | null,
  profilePermissions: ProfilePermission[],
): PermissionRow[] {
  if (!profileId) {
    return MODULES.map((m) => ({ resource: m, actions: [], scope: 'own' as const }));
  }

  const permsForProfile = profilePermissions.filter((p) => p.profile_id === profileId);
  return MODULES.map((m) => {
    const match = permsForProfile.find((p) => p.resource === m);
    return {
      resource: m,
      actions: match?.actions ?? [],
      scope: (match?.scope as 'own' | 'group' | 'all') ?? 'own',
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function UsersPermissionsClient({
  users,
  organizations,
  profiles,
  profilePermissions,
}: UsersPermissionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- Filter state ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [filterOrgId, setFilterOrgId] = useState<string>('__all__');

  // --- Selected user for permission editing ---
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // --- Permission editing state ---
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [permissionRows, setPermissionRows] = useState<PermissionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // --- Derived ---
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(() => {
    let list = users;

    if (filterTab !== 'all') {
      list = list.filter((u) => u.type === filterTab);
    }

    if (filterOrgId !== '__all__') {
      list = list.filter((u) => u.organization_id === filterOrgId);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.organization_name ?? '').toLowerCase().includes(q),
      );
    }

    return list;
  }, [users, filterTab, filterOrgId, searchTerm]);

  // --- Handlers ---

  const handleSelectUser = useCallback(
    (user: UnifiedUser) => {
      setSelectedUserId(user.id);
      setEditProfileId(user.profile_id);
      setPermissionRows(buildPermissionState(user.profile_id, profilePermissions));
      setSaveMessage(null);
    },
    [profilePermissions],
  );

  const handleProfileChange = useCallback(
    (profileId: string) => {
      const resolvedId = profileId === '__custom__' ? null : profileId;
      setEditProfileId(resolvedId);
      setPermissionRows(buildPermissionState(resolvedId, profilePermissions));
    },
    [profilePermissions],
  );

  const handleToggleAction = useCallback(
    (resource: string, action: string) => {
      setPermissionRows((prev) =>
        prev.map((row) => {
          if (row.resource !== resource) return row;
          const has = row.actions.includes(action);
          return {
            ...row,
            actions: has
              ? row.actions.filter((a) => a !== action)
              : [...row.actions, action],
          };
        }),
      );
      // If user edits the matrix, clear the profile selection to indicate custom
      setEditProfileId(null);
    },
    [],
  );

  const handleScopeChange = useCallback(
    (resource: string, scope: 'own' | 'group' | 'all') => {
      setPermissionRows((prev) =>
        prev.map((row) => (row.resource === resource ? { ...row, scope } : row)),
      );
      setEditProfileId(null);
    },
    [],
  );

  const handleToggleActive = useCallback(
    async (user: UnifiedUser) => {
      const result = await toggleUserActive({
        userId: user.id,
        userType: user.type,
        isActive: !user.is_active,
      });

      if (result.error) {
        alert(result.error);
        return;
      }

      startTransition(() => router.refresh());
    },
    [router, startTransition],
  );

  const handleSavePermissions = useCallback(async () => {
    if (!selectedUser) return;

    setSaving(true);
    setSaveMessage(null);

    const activePerms = permissionRows.filter((r) => r.actions.length > 0);

    const result = await savePermissions({
      userId: selectedUser.id,
      userType: selectedUser.type,
      profileId: editProfileId,
      customPermissions: editProfileId ? [] : activePerms,
    });

    setSaving(false);

    if (result.error) {
      setSaveMessage(result.error);
      return;
    }

    setSaveMessage('Permissions saved successfully');
    startTransition(() => router.refresh());
  }, [selectedUser, permissionRows, editProfileId, router, startTransition]);

  // --- Render ---

  return (
    <div className="p-6">
      {/* ================================================================ */}
      {/*  HEADER                                                          */}
      {/* ================================================================ */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/home/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Shield className="h-6 w-6 text-indigo-500" />
              Users & Permissions
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage TDX agents and client users, assign profiles, and configure RBAC permissions
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users by name, email, or organization..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filter pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([
            ['all', 'All'],
            ['tdx_agent', 'TDX Agents'],
            ['org_user', 'Client Users'],
          ] as [FilterTab, string][]).map(([tab, label]) => (
            <Button
              key={tab}
              variant={filterTab === tab ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterTab(tab)}
            >
              {label}
            </Button>
          ))}

          <Select value={filterOrgId} onValueChange={setFilterOrgId}>
            <SelectTrigger className="w-[200px]">
              <Building2 className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Organizations</SelectItem>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ================================================================ */}
      {/*  USER TABLE                                                      */}
      {/* ================================================================ */}
      <Card className="mb-8">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="w-[110px]">Role</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead className="w-[90px]">Status</TableHead>
                <TableHead className="w-[150px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className={
                      selectedUserId === user.id
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                        : ''
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      {user.type === 'tdx_agent' ? (
                        <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          <Key className="mr-1 h-3 w-3" />
                          TDX
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Building2 className="mr-1 h-3 w-3" />
                          Client
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.type === 'tdx_agent' ? (
                        <span className="text-muted-foreground">All</span>
                      ) : (
                        user.organization_name ?? (
                          <span className="text-muted-foreground">--</span>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeClass(user.role)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.profile_name ?? (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={() => handleToggleActive(user)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectUser(user)}
                      >
                        <Settings className="mr-1 h-3.5 w-3.5" />
                        Edit Permissions
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/*  PERMISSION MATRIX (shown when user is selected)                 */}
      {/* ================================================================ */}
      {selectedUser && (
        <Card>
          <CardContent className="p-6">
            {/* Header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Shield className="h-5 w-5 text-indigo-500" />
                  Permissions for: {selectedUser.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedUser.type === 'tdx_agent'
                    ? 'TDX Agent'
                    : `Client User - ${selectedUser.organization_name ?? 'No organization'}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUserId(null);
                  setSaveMessage(null);
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Close
              </Button>
            </div>

            {/* Dropdowns row */}
            <div className="mb-6 flex flex-wrap items-end gap-4">
              {/* Organization dropdown (only for org_users) */}
              {selectedUser.type === 'org_user' && (
                <div className="w-[250px]">
                  <label className="mb-1.5 block text-sm font-medium">Organization</label>
                  <Select
                    value={selectedUser.organization_id ?? '__none__'}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No organization</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Profile dropdown */}
              <div className="w-[250px]">
                <label className="mb-1.5 block text-sm font-medium">Profile</label>
                <Select
                  value={editProfileId ?? '__custom__'}
                  onValueChange={handleProfileChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Custom</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.is_system ? ' (System)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* RBAC Matrix Table */}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[180px] font-semibold">Module</TableHead>
                    {BASE_ACTIONS.map((action) => (
                      <TableHead key={action} className="w-[80px] text-center text-xs font-semibold uppercase">
                        {action === 'read' ? 'View' : action.charAt(0).toUpperCase() + action.slice(1)}
                      </TableHead>
                    ))}
                    <TableHead className="w-[180px] text-center text-xs font-semibold uppercase">
                      Special
                    </TableHead>
                    <TableHead className="w-[120px] text-center text-xs font-semibold uppercase">
                      Scope
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionRows.map((row) => {
                    const specials = SPECIAL_ACTIONS[row.resource] ?? [];
                    return (
                      <TableRow key={row.resource}>
                        <TableCell className="font-medium">
                          {MODULE_LABELS[row.resource] ?? row.resource}
                        </TableCell>

                        {/* Base action checkboxes */}
                        {BASE_ACTIONS.map((action) => (
                          <TableCell key={action} className="text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={row.actions.includes(action)}
                                onCheckedChange={() =>
                                  handleToggleAction(row.resource, action)
                                }
                              />
                            </div>
                          </TableCell>
                        ))}

                        {/* Special actions */}
                        <TableCell>
                          {specials.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-2">
                              {specials.map((action) => (
                                <label
                                  key={action}
                                  className="flex items-center gap-1.5 text-xs"
                                >
                                  <Checkbox
                                    checked={row.actions.includes(action)}
                                    onCheckedChange={() =>
                                      handleToggleAction(row.resource, action)
                                    }
                                  />
                                  <span className="capitalize">{action}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-xs text-muted-foreground">--</div>
                          )}
                        </TableCell>

                        {/* Scope selector */}
                        <TableCell className="text-center">
                          <Select
                            value={row.scope}
                            onValueChange={(val) =>
                              handleScopeChange(
                                row.resource,
                                val as 'own' | 'group' | 'all',
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[100px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCOPES.map((scope) => (
                                <SelectItem key={scope} value={scope}>
                                  {scope.charAt(0).toUpperCase() + scope.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Save row */}
            <div className="mt-6 flex items-center justify-between">
              <div>
                {saveMessage && (
                  <p
                    className={`flex items-center gap-1.5 text-sm ${
                      saveMessage.includes('success')
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {saveMessage.includes('success') ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    {saveMessage}
                  </p>
                )}
              </div>
              <Button
                onClick={handleSavePermissions}
                disabled={saving || isPending}
              >
                <Shield className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
