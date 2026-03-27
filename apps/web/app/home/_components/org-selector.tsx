'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface OrgOption {
  id: string;
  name: string;
  slug: string;
  ticket_count: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function OrgSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);

  const currentOrgId = searchParams.get('org') ?? null;

  const currentOrg = organizations.find((o) => o.id === currentOrgId);
  const displayLabel = currentOrg ? currentOrg.name : 'All Organizations';

  /* Fetch organizations on mount */
  useEffect(() => {
    const fetchOrgs = async () => {
      const supabase = getSupabaseBrowserClient();

      // Get current user's agent record to find tenant_id
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!agent) {
        setLoading(false);
        return;
      }

      // Fetch organizations this agent has access to
      const { data: agentOrgs } = await supabase
        .from('agent_organizations')
        .select('organization_id')
        .eq('agent_id', user.id);

      let query = supabase
        .from('organizations')
        .select('id, name, slug')
        .eq('tenant_id', agent.tenant_id)
        .eq('is_active', true)
        .order('name');

      // If agent has specific org assignments, filter to those
      if (agentOrgs && agentOrgs.length > 0) {
        const orgIds = agentOrgs.map((ao) => ao.organization_id);
        query = query.in('id', orgIds);
      }

      const { data: orgs } = await query;

      // Fetch ticket counts per org
      const orgsWithCounts: OrgOption[] = await Promise.all(
        (orgs ?? []).map(async (org) => {
          const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id);

          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            ticket_count: count ?? 0,
          };
        }),
      );

      setOrganizations(orgsWithCounts);
      setLoading(false);
    };

    fetchOrgs();
  }, []);

  const handleSelect = (orgId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (orgId) {
      params.set('org', orgId);
    } else {
      params.delete('org');
    }
    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    startTransition(() => router.push(newUrl));
  };

  if (loading || organizations.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isPending}
        >
          <Building2 className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{displayLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* All Organizations option */}
        <DropdownMenuItem
          onClick={() => handleSelect(null)}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>All Organizations</span>
          </div>
          {!currentOrgId && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Individual organizations */}
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSelect(org.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{org.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {org.ticket_count}
              </Badge>
              {currentOrgId === org.id && <Check className="h-4 w-4" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
