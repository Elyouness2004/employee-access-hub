import { ChevronsUpDown } from 'lucide-react';

import { isRole, ROLES } from '@/shared/auth';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui';

import { useDevRole } from './DevIdentityProvider';

/**
 * ⚠️ DEVELOPMENT-ONLY control — lazily imported behind `env.isDev`, so it is
 * excluded from production builds. Switches the mocked identity to verify
 * role-shaped navigation; it neither creates tokens nor touches the backend.
 */
export default function DevRoleSwitcher() {
  const devRole = useDevRole();
  // Only meaningful while the dev identity adapter is the identity source.
  if (!devRole) return null;
  const { activeRole, setActiveRole } = devRole;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 select-none items-center gap-2 rounded-md border border-action-secondary-border bg-surface px-3 text-label text-ink-strong transition-colors duration-fast hover:bg-surface-hover max-md:h-11"
        >
          <Badge>DEV</Badge>
          <span className="font-mono text-mono-sm">{activeRole}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 text-ink-muted" />
          <span className="sr-only">Switch development role</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Development identity — not real authentication</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={activeRole}
          onValueChange={(value) => {
            if (isRole(value)) setActiveRole(value);
          }}
        >
          {ROLES.map((role) => (
            <DropdownMenuRadioItem key={role} value={role} className="font-mono text-mono-sm">
              {role}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
