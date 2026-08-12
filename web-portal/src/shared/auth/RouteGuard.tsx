import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useRoles } from './identity';
import type { Role } from './roles';

/**
 * Role-restricted route branch (FRONTEND-ARCHITECTURE §4). Renders the branch
 * when the identity holds ANY of the required roles; otherwise routes to /403,
 * passing the attempted path so the page can name it.
 *
 * Guards are UX only — the server authorizes every request (layers 2/3).
 * Keycloak pre-expands composite roles at issuance, so the flat check is
 * correct; no hierarchy logic exists client-side. Authentication itself is
 * enforced upstream by the auth feature's gate — by the time a RouteGuard
 * renders, an identity always exists.
 */
export interface RouteGuardProps {
  /** The branch renders when the identity holds at least one of these. */
  anyOf: readonly Role[];
}

/** Location state carried to /403 by a guard denial. */
export interface ForbiddenLocationState {
  attemptedPath?: string;
}

export function RouteGuard({ anyOf }: RouteGuardProps) {
  const { hasAny } = useRoles();
  const location = useLocation();

  if (!hasAny(...anyOf)) {
    const state: ForbiddenLocationState = { attemptedPath: location.pathname };
    return <Navigate to="/403" replace state={state} />;
  }
  return <Outlet />;
}
