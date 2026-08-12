import { LockKeyhole, TimerOff, WifiOff, type LucideIcon } from 'lucide-react';

import { formatDuration } from './format';
import type { SessionPolicy } from './session-policy';

/**
 * Why a session ended — four states the UI must never merge, because each one
 * is a different claim about the world:
 *
 *  - `idle`        — THIS CLIENT's advisory limit. Keycloak may still consider
 *                    the session valid, so the copy never says it expired.
 *  - `lifetime`    — the absolute cap. Nobody can extend it.
 *  - `expired`     — the authorization server refused to renew. A fact.
 *  - `unreachable` — we could not ask. Not a fact about the session at all, and
 *                    reporting it as `expired` would be the exact lie this
 *                    model exists to avoid.
 */
export type SessionEndReason = 'idle' | 'lifetime' | 'expired' | 'unreachable';

/**
 * The one place the four reasons are put into words, so the overlay (page
 * preserved) and the standalone screen (nothing to preserve) can never drift
 * into telling the user two different stories.
 */
export interface SessionEndedCopy {
  title: string;
  /** What happened. Safe on every surface — it promises nothing. */
  body: string;
  /**
   * What to do about it, worded for a surface that actually offers the action.
   * Absent where there is nothing to continue: telling someone to "continue"
   * beside a screen with no Continue button is worse than saying nothing.
   */
  continueHint?: string;
  icon: LucideIcon;
  /** Whether continuing in place is possible at all — drives the action set. */
  extendable: boolean;
  /** Label for the continue action; the verb differs per reason. */
  continueLabel: string;
}

/**
 * What re-authentication actually costs. Signing in again is a full-page
 * redirect to Keycloak: the route comes back, the SPA does not — so unsaved
 * input is gone. Saying "your work is preserved" here would be false, and the
 * user cannot make a sensible choice without knowing it.
 */
export const REAUTHENTICATION_NOTE =
  'Signing in again brings you back to this page, but reloads the application — anything you have typed and not saved will be lost.';

export function sessionEndedCopy(
  reason: SessionEndReason,
  policy: SessionPolicy,
): SessionEndedCopy {
  switch (reason) {
    case 'idle':
      return {
        title: 'Session paused after inactivity',
        body:
          `There was no activity for ${formatDuration(policy.idleTimeoutMs)}, so this page ` +
          'stopped using your session.',
        continueHint:
          'Continue to pick up exactly where you left off — nothing on this page is lost.',
        icon: LockKeyhole,
        extendable: true,
        continueLabel: 'Continue session',
      };
    case 'unreachable':
      return {
        title: 'Session could not be confirmed',
        body:
          'We could not reach the identity provider, so this page stopped using your session. ' +
          'It may still be perfectly valid.',
        continueHint: 'Try again once you are back online — nothing on this page is lost.',
        icon: WifiOff,
        extendable: true,
        continueLabel: 'Try again',
      };
    case 'lifetime':
      return {
        title: 'Session reached its time limit',
        body:
          `Sessions end after ${formatDuration(policy.maxLifetimeMs)} and cannot be extended, ` +
          'so this one is over.',
        icon: TimerOff,
        extendable: false,
        continueLabel: 'Continue session',
      };
    case 'expired':
      return {
        title: 'Your session has expired',
        body: 'Your organization account session is no longer valid, so this one is over.',
        icon: TimerOff,
        extendable: false,
        continueLabel: 'Continue session',
      };
  }
}
