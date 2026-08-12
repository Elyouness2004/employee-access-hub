import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Alert } from '@/shared/components';
import { Button, VisuallyHidden } from '@/shared/components/ui';

import { useOptionalAuth } from '../AuthProvider';
import { currentReturnPath } from '../return-path';
import { REAUTHENTICATION_NOTE } from '../session/ended-copy';
import { announceRemaining, formatRemaining } from '../session/format';
import { SESSION_UI_ATTRIBUTE } from '../session/idle-monitor';
import { useCountdown, useSessionIdle } from '../session/use-session-idle';

/**
 * The pre-expiry warning (WCAG 2.2.1 Timing Adjustable, DESIGN-SYSTEM §11.2).
 *
 * A persistent bar rather than a modal: the timeout is caused by *inactivity*,
 * so anything the user does legitimately resets it, and a modal would block the
 * very interaction that cancels the countdown. It sticks below the top bar so a
 * scrolled-down reader still sees it — a user who is present but not clicking is
 * exactly who this warning is for — while never covering focused content
 * (WCAG 2.4.11).
 *
 * Announcement discipline: a live region is atomic, so anything inside it that
 * changes re-reads the whole subtree. The bar is therefore not a live region at
 * all; it carries ONE small assertive node with a short sentence. The ticking
 * figure is `aria-hidden` and the spoken value is a RANGE true for its whole
 * band (`announceRemaining`), so the announcement fires once for the 60 s idle
 * warning and at most once a minute for the 5 min cap warning — never per
 * second, and never frozen at a value that has gone stale.
 *
 * Nothing here claims the Keycloak session is or is not valid — it warns about
 * this client's inactivity limit, and "Continue session" is what asks the server.
 */
export function SessionExpiryWarning() {
  const auth = useOptionalAuth();
  const idle = useSessionIdle();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const showing = auth?.state.status === 'authenticated' && idle.phase === 'warning';
  const seconds = useCountdown(idle.deadlineAt, showing);

  /**
   * Publish this bar's height as `--sticky-offset` while it is mounted, so
   * `scroll-padding-top` accounts for it and a focused element scrolled into
   * view is never left underneath it. A callback ref rather than an effect: it
   * runs on mount AND on unmount, so the offset cannot outlive the bar. It must
   * be stable — an inline arrow would be detached and re-attached on every
   * render, forcing a layout read once per second while the countdown ticks.
   */
  const raiseScrollPadding = useCallback((node: HTMLElement | null) => {
    document.documentElement.style.setProperty(
      '--sticky-offset',
      node ? `${node.offsetHeight}px` : '0px',
    );
  }, []);

  if (!showing || !auth) return null;

  const extendable = idle.deadline === 'idle';

  const onContinue = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await auth.continueSession();
    setBusy(false);
    // 'continued' → the banner unmounts on its own (phase back to active).
    // 'reauthentication-required' → the provider switched to the ended state
    // and the lock overlay takes over. Only the transient case needs words.
    if (outcome === 'unavailable') {
      setProblem(
        'We could not reach the identity provider just now, so the session could not be confirmed. Try again — your work on this page is untouched.',
      );
    }
  };

  const onSignIn = () => {
    setProblem(null);
    void auth.signIn(currentReturnPath(location)).catch(() => {
      setProblem('Sign-in could not be started. Check your connection and try again.');
    });
  };

  return (
    // Sticky under the 56px top bar so a scrolled-down reader — exactly the
    // person this warning is for — still sees it, while `--sticky-offset` keeps
    // `scroll-padding-top` (globals.css) large enough that a focused element
    // can never end up hidden behind it (WCAG 2.4.11).
    // A named complementary landmark, not a live region: the bar is reachable
    // by landmark navigation and its content belongs to something, while the
    // announcement stays confined to the one small node below.
    <aside ref={raiseScrollPadding} aria-label="Session status" className="sticky top-14 z-30">
      <Alert
        tone="warning"
        // The bar is NOT a live region. Live regions are atomic, so a bar that
        // contains a countdown would re-read its headline, sentence and caveat
        // on every change — once a second at worst, five times over for the
        // 5-minute cap warning. The single small live node below carries the
        // announcement instead.
        live={false}
        // Interacting with the countdown is not "using the app": without this
        // the pointerdown on Continue would reset the clock, unmount the banner
        // and discard the click before it verified anything.
        {...{ [SESSION_UI_ATTRIBUTE]: '' }}
        className="rounded-none border-x-0 border-t-0"
        title={
          extendable ? 'Your session is about to expire' : 'Your session reaches its time limit'
        }
        actions={
          <>
            {extendable ? (
              <Button size="compact" loading={busy} onClick={() => void onContinue()}>
                Continue session
              </Button>
            ) : null}
            <Button size="compact" variant="secondary" onClick={onSignIn}>
              Sign in again
            </Button>
          </>
        }
      >
        {/* Sighted copy: exact and ticking. Hidden from assistive tech, which
            gets the self-contained sentence below instead — a per-second value
            in a live region re-reads the whole banner, and outside one it would
            simply go stale. Splitting them keeps each read grammatical. */}
        <p aria-hidden="true">
          {extendable
            ? 'You have been inactive for a while. For your security, your session will expire in '
            : 'Sessions end after a fixed maximum length and this one cannot be extended. It ends in '}
          {formatRemaining(seconds)}.{extendable ? '' : ` ${REAUTHENTICATION_NOTE}`}
        </p>
        <VisuallyHidden role="alert">
          {extendable
            ? `You have been inactive. For your security your session expires in ${announceRemaining(seconds)}. Choose Continue session to stay signed in.`
            : `Your session reaches its maximum length in ${announceRemaining(seconds)} and cannot be extended. ${REAUTHENTICATION_NOTE}`}
        </VisuallyHidden>
        {problem ? <p className="mt-1">{problem}</p> : null}
      </Alert>
    </aside>
  );
}
