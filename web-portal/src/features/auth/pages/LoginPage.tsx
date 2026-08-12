import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ErrorState } from '@/shared/components';
import { Button } from '@/shared/components/ui';

import { useAuth } from '../AuthProvider';
import { AuthSplash } from '../components/AuthSplash';
import type { LoginLocationState } from '../guards/RequireAuth';
import { sanitizeReturnPath } from '../return-path';
import { sessionEndedCopy } from '../session/ended-copy';

/**
 * The controlled entry point to the organization's identity provider. The SPA
 * renders no credential form, ever — sign-in is a full-page redirect to
 * Keycloak (Authorization Code + PKCE S256). States: idle, redirecting,
 * sign-in start failure, plus arrival notices (signed out / auth error) that
 * keep this page distinct from the session-expired screen.
 */
export function LoginPage() {
  const { state, mode, signIn, sessionPolicy } = useAuth();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);
  const [startError, setStartError] = useState(false);

  const locationState = (location.state ?? null) as LoginLocationState | null;
  const returnTo = sanitizeReturnPath(locationState?.returnTo);

  // Never show a login form to a signed-in user; never flash it mid-restore.
  if (state.status === 'authenticated') return <Navigate to={returnTo} replace />;
  if (state.status === 'restoring') return <AuthSplash />;
  // Dev builds running the mock identity have no sign-in step at all — the
  // identity already exists above the router, so this route is meaningless.
  if (mode !== 'oidc') return <Navigate to={returnTo} replace />;

  // The four arrival notices stay distinct, and an ended session keeps ITS
  // reason: an advisory idle lock must not read as "Keycloak rejected you".
  const notice =
    state.status === 'expired'
      ? `${sessionEndedCopy(state.reason, sessionPolicy).title}. Sign in to continue.`
      : locationState?.reason === 'signed-out'
        ? 'You have signed out.'
        : locationState?.reason === 'auth-error'
          ? 'Sign-in did not complete. Please try again.'
          : null;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <main className="flex w-full max-w-md flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <ShieldCheck aria-hidden="true" className="size-6 text-ink-muted" />
          <h1 className="text-page-title text-ink-strong">Employee Access Hub</h1>
          <p className="text-body text-ink-muted">
            Sign in with your organization account. Authentication is handled by the
            organization&rsquo;s identity provider — your password is never entered here.
          </p>
          {notice ? (
            <p role="status" aria-live="polite" className="text-body-secondary text-ink">
              {notice}
            </p>
          ) : null}
          <div className="mt-3">
            <Button
              loading={redirecting}
              onClick={() => {
                setStartError(false);
                setRedirecting(true);
                void signIn(returnTo).catch(() => {
                  setRedirecting(false);
                  setStartError(true);
                });
              }}
            >
              {redirecting ? 'Redirecting to sign-in…' : 'Sign in with your organization account'}
            </Button>
          </div>
        </div>
        {startError ? (
          <ErrorState
            title="Sign-in could not start"
            detail="The identity provider could not be reached. Check your connection and try again."
          />
        ) : null}
      </main>
    </div>
  );
}
