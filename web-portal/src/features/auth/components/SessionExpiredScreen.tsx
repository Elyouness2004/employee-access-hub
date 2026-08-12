import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/shared/components/ui';

import { useAuth } from '../AuthProvider';
import { currentReturnPath } from '../return-path';
import { sessionEndedCopy, type SessionEndReason } from '../session/ended-copy';

/**
 * Session-ended state for the ONE case where there is no page to preserve: the
 * session ended (usually a peer tab's broadcast) before this tab ever rendered
 * protected content. Everywhere else `SessionEndedOverlay` covers a still-mounted
 * route instead — losing the user's work is not acceptable merely because a
 * timer fired.
 *
 * It reads its words from the same `sessionEndedCopy` as the overlay, so the two
 * surfaces cannot drift into telling different stories about the same reason.
 * There is nothing typed here to lose, so the re-authentication caveat the
 * overlay carries is deliberately absent.
 *
 * Distinct from sign-out (login-page notice), from authentication failure
 * (callback error), and from 403 (ForbiddenPage).
 *
 * The state can arrive mid-session from another tab, so it is a context change
 * the user did not initiate: the heading takes focus. That focus move is the
 * announcement — a live region around the same text would say it twice.
 */
export function SessionExpiredScreen({ reason }: { reason: SessionEndReason }) {
  const { signIn, sessionPolicy } = useAuth();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = sessionEndedCopy(reason, sessionPolicy);
  const Icon = copy.icon;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="flex w-full max-w-dialog-sm flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center">
        <Icon aria-hidden="true" className="size-6 text-ink-muted" />
        <h1 ref={headingRef} tabIndex={-1} className="text-page-title text-ink-strong">
          {copy.title}
        </h1>
        {/* `continueHint` is deliberately omitted: this surface offers no
            Continue action, and inviting one that does not exist is worse than
            saying nothing. */}
        <p className="mt-2 text-body text-ink-muted">
          {copy.body} Sign in again to continue — you will return to this page.
        </p>
        {problem ? (
          <p role="alert" className="mt-2 text-body-secondary text-status-danger-text">
            {problem}
          </p>
        ) : null}
        <div className="mt-3">
          <Button
            loading={redirecting}
            onClick={() => {
              setRedirecting(true);
              setProblem(null);
              void signIn(currentReturnPath(location)).catch(() => {
                setRedirecting(false);
                setProblem('Sign-in could not be started. Check your connection and try again.');
              });
            }}
          >
            Sign in again
          </Button>
        </div>
      </div>
    </main>
  );
}
