import { ChevronDown, LogOut, MonitorSmartphone, Moon, Sun, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useMockIdentity } from '@/config/env';
import { useIdentity, useSessionControls } from '@/shared/auth';
import {
  Avatar,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui';
import { useTheme } from '@/shared/theme/ThemeProvider';

/**
 * The authenticated actor is always discoverable: display name, username, and
 * role chips (roles come from the identity contract only). Sign out acts
 * through the shared SessionControls contract (real Keycloak logout in every
 * production build); only when no real session exists — the dev mock identity
 * — is it disabled WITH its reason stated, per the disabled-controls rule.
 */
export function UserMenu() {
  const identity = useIdentity();
  const sessionControls = useSessionControls();
  const { theme, toggle } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 select-none items-center gap-2 rounded-md px-2 text-body text-ink transition-colors duration-fast hover:bg-surface-hover max-md:h-11"
        >
          <Avatar name={identity.displayName} size="md" />
          <span className="hidden sm:block">{identity.displayName}</span>
          <ChevronDown aria-hidden="true" className="hidden size-4 text-ink-muted sm:block" />
          <span className="sr-only">User menu</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-body font-medium text-ink-strong">
            {identity.displayName}
          </span>
          <span className="block font-mono text-mono-sm text-ink-muted">{identity.username}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {identity.roles.map((role) => (
              <Badge key={role} className="font-mono">
                {role}
              </Badge>
            ))}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account/profile" className="text-ink no-underline">
            <UserRound aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account/sessions" className="text-ink no-underline">
            <MonitorSmartphone aria-hidden="true" />
            Sessions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggle}>
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sessionControls ? (
          <DropdownMenuItem onSelect={sessionControls.signOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <LogOut aria-hidden="true" />
            <span>
              <span className="block">Sign out</span>
              <span className="block text-caption text-ink-disabled">
                {useMockIdentity
                  ? 'Unavailable — this is the development mock identity'
                  : 'Unavailable — no active session'}
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
