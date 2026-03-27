'use client';

import { useRouter } from 'next/navigation';

import { Search, Bell, Plus, ChevronDown, User, LogOut } from 'lucide-react';

import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { useUser } from '@kit/supabase/hooks/use-user';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { ModeToggle } from '@kit/ui/mode-toggle';

import pathsConfig from '~/config/paths.config';

function getInitials(email: string | undefined): string {
  if (!email) return 'U';

  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/);

  if (parts.length >= 2) {
    return (
      (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
    ).toUpperCase();
  }

  return name.substring(0, 2).toUpperCase();
}

export function Topbar() {
  const router = useRouter();
  const signOut = useSignOut();
  const user = useUser();
  const userData = user.data;

  const displayName =
    userData?.user_metadata?.display_name ??
    userData?.user_metadata?.name ??
    userData?.email?.split('@')[0] ??
    'User';

  const avatarUrl = userData?.user_metadata?.avatar_url as string | undefined;

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    router.push(pathsConfig.auth.signIn);
  };

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      {/* Search */}
      <div className="max-w-2xl flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets, users, assets..."
            className="border-border bg-muted/50 pl-10"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => router.push('/home/tickets?action=new')}
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push('/home/notifications')}
        >
          <Bell className="h-5 w-5" />
          <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs">
            3
          </Badge>
        </Button>

        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <Avatar className="h-8 w-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback>
                  {getInitials(userData?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm sm:inline-block">
                {displayName}
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/home/settings')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/home/settings')}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
