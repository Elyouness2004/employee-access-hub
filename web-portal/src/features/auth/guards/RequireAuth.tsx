import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { IdentityProvider } from '@/shared/auth';

import { useAuth } from '../AuthProvider';
import { AuthSplash } from '../components/AuthSplash';
import { SessionEndedOverlay } from '../components/SessionEndedOverlay';
import { SessionExpiredScreen } from '../components/SessionExpiredScreen';
import { currentReturnPath } from '../return-path';

/** Router state passed to /login by the authentication gate. */
export interface LoginLocationState {
  returnTo?: string;
  reason?: 'signed-out' | 'auth-error';
}

/**
 * The authentication gate over every protected branch:
 *
 *  - restoring      → splash (the shell must never flash pre-auth)
 *  - expired        → the page STAYS MOUNTED under a modal ended-session
 *                     overlay, so re-authenticating costs the user nothing
 *  - unauthenticated→ redirect to /login carrying the intended route
 *  - authenticated  → the shared IdentityProvider + the branch itself
 *
 * Inside the branch the Phase-1 identity contract holds unchanged: consumers
 * (shell, guards, pages) cannot tell OIDC from the dev fixtures.
 */
export function RequireAuth() {
  const { state, idle } = useAuth();
  const location = useLocation();

  // In-app navigation is user activity — it cannot happen without a click or a
  // keypress, and it is the one interaction the document-level listeners in the
  // idle monitor could plausibly miss (a link inside a portal, a redirect the
  // user triggered a moment earlier).
  useEffect(() => {
    idle.recordActivity();
  }, [idle, location.pathname]);

  switch (state.status) {
    case 'restoring':
      return <AuthSplash />;
    case 'expired':
      // No identity means nothing protected has rendered in this tab yet —
      // there is no page worth preserving, so the standalone screen is honest.
      return state.identity ? (
        <IdentityProvider identity={state.identity}>
          <Outlet />
          <SessionEndedOverlay reason={state.reason} />
        </IdentityProvider>
      ) : (
        <SessionExpiredScreen reason={state.reason} />
      );
    case 'unauthenticated': {
      const loginState: LoginLocationState = {
        returnTo: currentReturnPath(location),
        ...(state.reason !== 'no-session' ? { reason: state.reason } : {}),
      };
      return <Navigate to="/login" replace state={loginState} />;
    }
    case 'authenticated':
      return (
        <IdentityProvider identity={state.identity}>
          <Outlet />
        </IdentityProvider>
      );
  }
}
