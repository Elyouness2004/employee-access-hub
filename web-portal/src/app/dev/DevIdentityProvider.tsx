import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { env } from '@/config/env';
import { IdentityProvider, isRole, type Identity, type Role } from '@/shared/auth';
import { usePreference } from '@/shared/hooks/use-preference';

/**
 * ⚠️ DEVELOPMENT-ONLY IDENTITY — NOT AUTHENTICATION. ⚠️
 *
 * Phase 1 has no Keycloak session: this adapter feeds the shared identity
 * contract with fixture identities so the shell's role-shaped navigation,
 * user menu, and responsive behavior can be built and verified. It:
 *   - creates and stores NO tokens,
 *   - simulates NO backend authorization (the server always authorizes),
 *   - is replaced wholesale in Phase 2 by the OIDC provider feeding the SAME
 *     `IdentityProvider` contract — no consumer changes.
 *
 * Role lists mirror Keycloak's composite expansion (MANAGER/HR/ADMIN each
 * include EMPLOYEE) exactly as a real token would carry them. Subjects are
 * deliberately non-UUID `dev-*` strings so they can never be mistaken for
 * real Keycloak account ids.
 */
export const DEV_IDENTITIES: Record<Role, Identity> = {
  EMPLOYEE: {
    subject: 'dev-subject-employee',
    username: 'dev.employee',
    displayName: 'Dev Employee',
    roles: ['EMPLOYEE'],
  },
  MANAGER: {
    subject: 'dev-subject-manager',
    username: 'dev.manager',
    displayName: 'Dev Manager',
    roles: ['MANAGER', 'EMPLOYEE'],
  },
  HR: {
    subject: 'dev-subject-hr',
    username: 'dev.hr',
    displayName: 'Dev HR',
    roles: ['HR', 'EMPLOYEE'],
  },
  ADMIN: {
    subject: 'dev-subject-admin',
    username: 'dev.admin',
    displayName: 'Dev Admin',
    roles: ['ADMIN', 'EMPLOYEE'],
  },
};

interface DevRoleContextValue {
  activeRole: Role;
  setActiveRole: (role: Role) => void;
}

const DevRoleContext = createContext<DevRoleContextValue | null>(null);

export function DevIdentityProvider({ children }: { children: ReactNode }) {
  const [storedRole, setStoredRole] = usePreference<string>('devRole', env.devRole ?? 'EMPLOYEE');
  const activeRole: Role = isRole(storedRole) ? storedRole : 'EMPLOYEE';

  const value = useMemo<DevRoleContextValue>(
    () => ({ activeRole, setActiveRole: setStoredRole }),
    [activeRole, setStoredRole],
  );

  return (
    <DevRoleContext.Provider value={value}>
      <IdentityProvider identity={DEV_IDENTITIES[activeRole]}>{children}</IdentityProvider>
    </DevRoleContext.Provider>
  );
}

/**
 * Null when the dev identity adapter is not the active identity source
 * (e.g. tests injecting a plain identity fixture, or Phase 2 real auth) —
 * the role switcher renders nothing in that case.
 */
export function useDevRole(): DevRoleContextValue | null {
  return useContext(DevRoleContext);
}
