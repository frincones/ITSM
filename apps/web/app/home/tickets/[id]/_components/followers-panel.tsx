'use client';

import { useState, useTransition } from 'react';
import { BellRing, BellOff, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui/tooltip';

import { followTicket, unfollowTicket } from '~/lib/actions/tickets';

export interface FollowerRow {
  agent_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  user_id: string | null;
  added_reason: string | null;
  is_auto: boolean;
}

interface AgentOption {
  id: string;
  name: string;
  email?: string | null;
  avatar_url?: string | null;
  role?: string | null;
}

interface FollowersPanelProps {
  ticketId: string;
  initialFollowers: FollowerRow[];
  currentAgentId: string | null;
  /** Only TDX staff agents should show up in the "add" picker. */
  agents: AgentOption[];
}

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??'
  );
}

const REASON_LABELS: Record<string, string> = {
  creator: 'creó el ticket',
  assignment: 'asignación',
  reassignment: 'reasignación',
  followup: 'comentó',
  mention: 'mencionado',
  manual: 'agregado manualmente',
  assignee: 'responsable actual',
};

export function FollowersPanel({
  ticketId,
  initialFollowers,
  currentAgentId,
  agents,
}: FollowersPanelProps) {
  const [followers, setFollowers] = useState<FollowerRow[]>(initialFollowers);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const isFollowing =
    currentAgentId != null && followers.some((f) => f.agent_id === currentAgentId);

  const nonFollowerAgents = agents.filter(
    (a) => !followers.some((f) => f.agent_id === a.id),
  );

  function handleToggleSelf() {
    if (!currentAgentId) return;
    if (isFollowing) {
      startTransition(async () => {
        const prev = followers;
        setFollowers((fs) => fs.filter((f) => f.agent_id !== currentAgentId));
        const res = await unfollowTicket(ticketId);
        if (res.error) {
          setFollowers(prev);
          toast.error(res.error);
        } else {
          toast.success('Dejaste de seguir el ticket');
        }
      });
    } else {
      startTransition(async () => {
        const me = agents.find((a) => a.id === currentAgentId);
        const optimistic: FollowerRow = {
          agent_id: currentAgentId,
          name: me?.name ?? null,
          email: me?.email ?? null,
          avatar_url: me?.avatar_url ?? null,
          user_id: null,
          added_reason: 'manual',
          is_auto: false,
        };
        setFollowers((fs) => [...fs, optimistic]);
        const res = await followTicket(ticketId);
        if (res.error) {
          setFollowers((fs) => fs.filter((f) => f.agent_id !== currentAgentId));
          toast.error(res.error);
        } else {
          toast.success('Ahora sigues el ticket');
        }
      });
    }
  }

  function handleAddAgent(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    startTransition(async () => {
      const optimistic: FollowerRow = {
        agent_id: agent.id,
        name: agent.name,
        email: agent.email ?? null,
        avatar_url: agent.avatar_url ?? null,
        user_id: null,
        added_reason: 'manual',
        is_auto: false,
      };
      setFollowers((fs) => [...fs, optimistic]);
      const res = await followTicket(ticketId, agent.id);
      if (res.error) {
        setFollowers((fs) => fs.filter((f) => f.agent_id !== agent.id));
        toast.error(res.error);
      } else {
        toast.success(`${agent.name} agregado como seguidor`);
      }
    });
    setShowAdd(false);
  }

  function handleRemove(agentId: string) {
    startTransition(async () => {
      const prev = followers;
      setFollowers((fs) => fs.filter((f) => f.agent_id !== agentId));
      const res = await unfollowTicket(ticketId, agentId);
      if (res.error) {
        setFollowers(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Seguidores
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleToggleSelf}
          disabled={!currentAgentId || isPending}
        >
          {isFollowing ? (
            <>
              <BellOff className="mr-1 h-3 w-3" /> Dejar de seguir
            </>
          ) : (
            <>
              <BellRing className="mr-1 h-3 w-3" /> Seguir
            </>
          )}
        </Button>
      </div>

      <TooltipProvider>
        <div className="space-y-2">
          {followers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nadie sigue este ticket todavía. Cuando alguien lo asigne o comente, se agregará automáticamente.
            </p>
          ) : (
            followers.map((f) => {
              const reason = f.added_reason ? REASON_LABELS[f.added_reason] ?? f.added_reason : null;
              return (
                <Tooltip key={f.agent_id}>
                  <TooltipTrigger asChild>
                    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                      <Avatar className="h-7 w-7">
                        {f.avatar_url ? (
                          <AvatarImage src={f.avatar_url} alt={f.name ?? ''} />
                        ) : (
                          <AvatarFallback className="text-[10px]">
                            {getInitials(f.name)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                          {f.name ?? 'Agente'}
                        </p>
                        {reason && (
                          <p className="truncate text-[10px] text-muted-foreground">
                            {reason}
                            {f.is_auto ? ' · auto' : ''}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleRemove(f.agent_id)}
                        disabled={isPending}
                        title="Quitar"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {f.email ?? f.name ?? 'Seguidor'}
                  </TooltipContent>
                </Tooltip>
              );
            })
          )}
        </div>
      </TooltipProvider>

      {/* Add-agent picker */}
      {showAdd ? (
        <div className="mt-3 rounded-md border border-border bg-background">
          <div className="max-h-48 overflow-auto py-1">
            {nonFollowerAgents.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Todos los agentes ya están siguiendo.
              </p>
            ) : (
              nonFollowerAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50"
                  onClick={() => handleAddAgent(a.id)}
                >
                  <Avatar className="h-5 w-5">
                    {a.avatar_url ? (
                      <AvatarImage src={a.avatar_url} alt={a.name} />
                    ) : (
                      <AvatarFallback className="text-[9px]">
                        {getInitials(a.name)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="flex-1 truncate">{a.name}</span>
                  {a.role && (
                    <Badge variant="secondary" className="text-[9px]">
                      {a.role}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border px-3 py-2 text-right">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowAdd(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          onClick={() => setShowAdd(true)}
          disabled={isPending}
        >
          <UserPlus className="mr-1 h-3 w-3" /> Agregar seguidor
        </Button>
      )}
    </div>
  );
}
