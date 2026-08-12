import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { hasAnyRole, type Role } from './roles';

/**
 * The identity contract application code programs against.
 *
 * Phase 2 will supply this from OIDC token claims (`sub`, `preferred_username`,
 * `realm_access.roles`) plus the `GET /api/hr/auth/me` server probe. Phase 1
 * supplies it from a development-only adapter (app/dev). Components cannot tell
 * the difference — that is the point: swapping the source touches no consumer.
 *
 * `subject` is the Keycloak account id (JWT `sub`) — NEVER an employeeId.
 * Ownership checks compare `subject` against `*KeycloakId` fields.
 */
export interface Identity {
  /** Keycloak subject (`sub`) — the login account id, not the HR employeeId. */
  subject: string;
  /** `preferred_username` claim. */
  username: string;
  /** Human-readable name for the user menu. */
  displayName: string;
  /** Pre-expanded realm roles (composites resolved at issuance). */
  roles: readonly Role[];
}

const IdentityContext = createContext<Identity | null>(null);

export function IdentityProvider({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  return <IdentityContext.Provider value={identity}>{children}</IdentityContext.Provider>;
}

/** The authenticated identity; throws outside a provider (a wiring bug). */
export function useIdentity(): Identity {
  const identity = useContext(IdentityContext);
  if (!identity) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return identity;
}

/** Role helpers over the current identity (flat checks only). */
export function useRoles(): { roles: readonly Role[]; hasAny: (...required: Role[]) => boolean } {
  const { roles } = useIdentity();
  return useMemo(
    () => ({
      roles,
      hasAny: (...required: Role[]) => hasAnyRole(roles, required),
    }),
    [roles],
  );
}
