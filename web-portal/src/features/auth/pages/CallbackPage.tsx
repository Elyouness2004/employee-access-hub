import { ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert } from '@/shared/components';
import { Button } from '@/shared/components/ui';

import { useAuth } from '../AuthProvider';
import { AuthSplash } from '../components/AuthSplash';

/**
 * P01 — /auth/callback. Completes the Authorization Code + PKCE exchange
 * (state and PKCE verifier are validated by oidc-client-ts against the
 * transaction it started) and restores the pre-login route. The return path
 * travels through OIDC `state` and is sanitized before navigation — only
 * in-app paths, via the router, never window.location: no open redirect.
 *
 * On failure the raw protocol error is never rendered; the user gets a safe
 * message and a way back into the login flow. A refresh of this URL lands
 * here too (the transaction is already consumed) — same recovery.
 */
export function CallbackPage() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // One completion only — guards StrictMode's double-invoked dev effects from
  // consuming the one-shot authorization response twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    completeSignIn()
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch(() => setFailed(true));
  }, [completeSignIn, navigate]);

  if (!failed) return <AuthSplash status="Completing sign-in…" />;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <main className="flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center">
        <ShieldAlert aria-hidden="true" className="size-6 text-ink-muted" />
        <h1 className="text-page-title text-ink-strong">Sign-in could not be completed</h1>
        <Alert tone="danger" live="assertive" className="mt-2 text-left">
          The sign-in response was invalid or has expired — this can happen when the page is
          refreshed mid–sign-in. No credentials were exposed.
        </Alert>
        <div className="mt-3">
          <Button onClick={() => navigate('/login', { replace: true })}>Return to sign-in</Button>
        </div>
      </main>
    </div>
  );
}
