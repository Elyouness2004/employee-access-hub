import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/shared/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/components/ui/Dialog';

import { useAuth } from '../AuthProvider';
import { currentReturnPath } from '../return-path';
import {
  REAUTHENTICATION_NOTE,
  sessionEndedCopy,
  type SessionEndReason,
} from '../session/ended-copy';
import { SESSION_UI_ATTRIBUTE } from '../session/idle-monitor';

/**
 * The session-ended overlay — an application-level modal ABOVE the still-mounted
 * page, never a replacement for it (FRONTEND-ARCHITECTURE §5.2, DESIGN-SYSTEM
 * §11.2).
 *
 * What that buys: the route, its scroll position, table filters, selected tabs
 * and half-typed form fields are all exactly where the user left them. The page
 * underneath cannot be *used* — Radix marks it `aria-hidden`, traps focus here,
 * and the request gate in `shared/api` blocks any call it might still try to
 * make — but it is not destroyed. That is what makes the WCAG 2.2.1 security
 * exception unnecessary: continuing costs the user nothing.
 *
 * It is careful about which promise it makes. **Continue** resumes in place and
 * really does preserve everything. **Sign in again** is a full-page redirect to
 * Keycloak: the route comes back, the application is rebuilt, and unsaved input
 * is gone — so the overlay says so rather than implying otherwise.
 *
 * Escape does not dismiss it: dismissing would leave a page that looks usable
 * and silently is not. The only ways out are the two buttons.
 */
export function SessionEndedOverlay({ reason }: { reason: SessionEndReason }) {
  const { continueSession, signIn, sessionPolicy } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState<'continue' | 'signin' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const copy = sessionEndedCopy(reason, sessionPolicy);
  const Icon = copy.icon;

  const onContinue = async () => {
    setBusy('continue');
    setProblem(null);
    const outcome = await continueSession();
    setBusy(null);
    // 'continued' → this overlay unmounts. 'reauthentication-required' → the
    // provider moved to a non-extendable reason and the copy changes with it.
    if (outcome === 'unavailable') {
      setProblem('We still could not reach the identity provider. Try again in a moment.');
    }
  };

  const onSignIn = () => {
    setBusy('signin');
    setProblem(null);
    void signIn(currentReturnPath(location)).catch(() => {
      setBusy(null);
      setProblem('Sign-in could not be started. Check your connection and try again.');
    });
  };

  // Focus the action people almost always want. Without this Radix would focus
  // the first tabbable element, which is the secondary one.
  const focusPrimary = useCallback(
    (event: Event) => {
      if (!copy.extendable) return;
      event.preventDefault();
      const dialog = event.currentTarget as HTMLElement;
      dialog.querySelector<HTMLButtonElement>('[data-primary-action]')?.focus();
    },
    [copy.extendable],
  );

  return (
    <Dialog open>
      <DialogContent
        size="sm"
        role="alertdialog"
        {...{ [SESSION_UI_ATTRIBUTE]: '' }}
        // No dismissal path may bypass re-authentication: a dismissed overlay
        // would leave a page that looks live and cannot talk to the server.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={focusPrimary}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon aria-hidden="true" className="size-6 text-ink-muted" />
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.body} {copy.continueHint ? `${copy.continueHint} ` : ''}
            {REAUTHENTICATION_NOTE}
          </DialogDescription>
          {problem ? (
            <p role="alert" className="text-body-secondary text-status-danger-text">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-center">
          <Button variant="secondary" loading={busy === 'signin'} onClick={onSignIn}>
            Sign in again
          </Button>
          {copy.extendable ? (
            <Button
              data-primary-action=""
              loading={busy === 'continue'}
              onClick={() => void onContinue()}
            >
              {copy.continueLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
