import type { LucideIcon } from 'lucide-react';

import { hasAnyRole, type Role } from '@/shared/auth/roles';

/**
 * One typed navigation model feeds the desktop sidebar AND the mobile drawer —
 * navigation is never defined twice. Items carry their required roles;
 * filtering HIDES unauthorized entries (never disabled). Guards remain UX:
 * the server authorizes.
 */

export interface NavItem {
  /** Route path — must exist in the approved sitemap (FRONTEND-SPECIFICATION §4). */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see this item; omitted = every authenticated role. */
  roles?: readonly Role[];
}

export interface NavGroup {
  id: string;
  /** Group heading (sentence case); the all-roles workspace group shows none. */
  label?: string;
  /** Roles that see the whole group; omitted = every authenticated role. */
  roles?: readonly Role[];
  items: readonly NavItem[];
}

/** Role-shape the nav: drop unauthorized groups/items entirely. */
export function filterNavGroups(groups: readonly NavGroup[], roles: readonly Role[]): NavGroup[] {
  return groups
    .filter((group) => !group.roles || hasAnyRole(roles, group.roles))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || hasAnyRole(roles, item.roles)),
    }))
    .filter((group) => group.items.length > 0);
}
