import type { SessionEndReason } from '../session/ended-copy';

import type { AuthChannel } from './auth-channel';

/**
 * CrossTabRefreshCoordinator — guarantees the realm's refresh-token rotation
 * policy (`refreshTokenMaxReuse: 0`, revoke-on-reuse) never sees concurrent
 * refreshes from this browser, which would revoke the whole SSO session.
 *
 * ## Algorithm
 *
 * Renewal (`renew()`):
 *  1. In-tab single-flight: concurrent callers (expiry timer + 401 replays)
 *     share one attempt.
 *  2. Cross-tab mutual exclusion: the attempt runs inside an exclusive Web
 *     Lock (`eah:auth:refresh`). Web Locks are browser-managed — a crashed or
 *     closed tab releases its lock automatically, so the lock can never be
 *     permanently stuck.
 *  3. Peer double-check inside the lock: snapshot the local user before
 *     queuing; if a peer's fan-out (`user-updated`) replaced it with a
 *     still-valid one while we waited, that IS our renewal — return `adopted`
 *     without touching the refresh token. A merely fresh-LOOKING token is not
 *     enough to skip: a 401-triggered renewal must proceed even then, because
 *     the server has already rejected that token.
 *  4. Otherwise perform ONE real renewal in this tab and broadcast the fresh
 *     serialized user; every other tab adopts it, keeping the whole browser
 *     on a single refresh-token lineage.
 *
 * ## Failure modes
 *  - Renewal rejected by Keycloak (`invalid_grant`, `login_required`) →
 *     `failed/session-gone`; the owner announces `session-expired` and every
 *     tab shows the session-expired state.
 *  - Network failure → `failed/transient`; the current (still valid) token
 *     stays in use and the caller may retry before real expiry.
 *  - Lock wait exceeding `lockWaitTimeoutMs` (pathological hang in another
 *     tab) → after the timeout we re-check for an adopted fan-out; if none
 *     arrived we FAIL the renewal rather than refresh without the lock — an
 *     unlocked refresh risks revoking every tab's session, while a failed
 *     renewal only costs a silent re-login through the SSO cookie.
 *  - No Web Locks API (out-of-support browser) → in-tab single-flight only;
 *     documented degradation, modern browsers all provide it.
 *
 * Logout and expiry propagate over the same channel (`signed-out`,
 * `session-expired`); a booting tab first asks peers for the current session
 * (`handoff-request`) so it joins the existing token lineage instead of
 * minting a second one.
 */

export type RenewalAttempt =
  { ok: true; payload: string } | { ok: false; reason: 'session-gone' | 'transient' };

export type RenewalResult =
  | { status: 'renewed'; payload: string }
  | { status: 'adopted'; payload: string }
  | { status: 'failed'; reason: 'session-gone' | 'transient' | 'lock-timeout' };

export interface CoordinatorCallbacks {
  /** Perform the real OIDC silent renewal in THIS tab. Never throws. */
  performRenewal: () => Promise<RenewalAttempt>;
  /** Serialized current user (User.toStorageString()) or null. */
  currentUserPayload: () => string | null;
  /** Seconds until the current access token expires, or null when none. */
  currentTokenSecondsRemaining: () => number | null;
  /** A peer renewed/signed in — adopt its user (synchronously). */
  onExternalUserUpdated: (payload: string) => void;
  /** A peer ended the session (renewal rejected, or its idle/lifetime limit). */
  onExternalSessionExpired: (reason: SessionEndReason) => void;
  /** A peer signed out — clear local state everywhere. */
  onExternalSignedOut: () => void;
  /** A peer saw real user activity (epoch ms) — advance the local idle clock. */
  onExternalActivity?: (at: number) => void;
  /** A peer revived a locked session after verifying it — unlock locally too. */
  onExternalSessionContinued?: (at: number) => void;
}

export interface CoordinatorOptions {
  channel: AuthChannel;
  /** Web Locks manager; pass null where unavailable (degraded mode). */
  locks: Pick<LockManager, 'request'> | null;
  callbacks: CoordinatorCallbacks;
  lockName?: string;
  /** Max time to wait for the refresh lock before failing safe. */
  lockWaitTimeoutMs?: number;
  /** How long a booting tab waits for a session handoff from peers. */
  handoffTimeoutMs?: number;
  /** A token with more seconds left than this is "already renewed". */
  freshThresholdSeconds?: number;
}

export class CrossTabRefreshCoordinator {
  private readonly channel: AuthChannel;
  private readonly locks: Pick<LockManager, 'request'> | null;
  private readonly callbacks: CoordinatorCallbacks;
  private readonly lockName: string;
  private readonly lockWaitTimeoutMs: number;
  private readonly handoffTimeoutMs: number;
  private readonly freshThresholdSeconds: number;

  private readonly unsubscribe: () => void;
  private inFlight: Promise<RenewalResult> | null = null;
  private readonly pendingHandoffs = new Map<string, (payload: string) => void>();

  constructor(options: CoordinatorOptions) {
    this.channel = options.channel;
    this.locks = options.locks;
    this.callbacks = options.callbacks;
    this.lockName = options.lockName ?? 'eah:auth:refresh';
    this.lockWaitTimeoutMs = options.lockWaitTimeoutMs ?? 15_000;
    this.handoffTimeoutMs = options.handoffTimeoutMs ?? 400;
    this.freshThresholdSeconds = options.freshThresholdSeconds ?? 90;

    this.unsubscribe = this.channel.subscribe((message) => {
      switch (message.type) {
        case 'user-updated':
          this.callbacks.onExternalUserUpdated(message.payload);
          break;
        case 'session-expired':
          this.callbacks.onExternalSessionExpired(message.reason ?? 'expired');
          break;
        case 'signed-out':
          this.callbacks.onExternalSignedOut();
          break;
        case 'handoff-request': {
          const payload = this.callbacks.currentUserPayload();
          if (payload) {
            this.channel.post({ type: 'handoff-response', requestId: message.requestId, payload });
          }
          break;
        }
        case 'handoff-response': {
          const resolve = this.pendingHandoffs.get(message.requestId);
          if (resolve) {
            this.pendingHandoffs.delete(message.requestId);
            resolve(message.payload);
          }
          break;
        }
        case 'user-activity':
          this.callbacks.onExternalActivity?.(message.at);
          break;
        case 'session-continued':
          this.callbacks.onExternalSessionContinued?.(message.at);
          break;
      }
    });
  }

  /** The single renewal entry point (in-tab single-flight, cross-tab locked). */
  renew(): Promise<RenewalResult> {
    this.inFlight ??= this.renewExclusive().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Ask already-open tabs for the current session (new-tab bootstrap). */
  requestHandoff(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pendingHandoffs.delete(requestId);
        resolve(null);
      }, this.handoffTimeoutMs);
      this.pendingHandoffs.set(requestId, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      this.channel.post({ type: 'handoff-request', requestId });
    });
  }

  /** Fan a locally obtained user (interactive login/callback) out to peers. */
  announceUserUpdated(payload: string): void {
    this.channel.post({ type: 'user-updated', payload });
  }

  announceSessionExpired(reason: SessionEndReason = 'expired'): void {
    this.channel.post({ type: 'session-expired', reason });
  }

  announceSignedOut(): void {
    this.channel.post({ type: 'signed-out' });
  }

  /** Fan this tab's user activity out so peers keep their idle clock in step. */
  announceActivity(at: number): void {
    this.channel.post({ type: 'user-activity', at });
  }

  /** Tell peers a locked session was revived after verification. */
  announceSessionContinued(at: number): void {
    this.channel.post({ type: 'session-continued', at });
  }

  dispose(): void {
    this.unsubscribe();
    this.pendingHandoffs.clear();
  }

  /**
   * "A peer renewed for us": the local user changed from the snapshot taken
   * before we queued, AND the replacement has real life left in it.
   */
  private adoptedResult(snapshot: string | null): RenewalResult | null {
    const payload = this.callbacks.currentUserPayload();
    if (!payload || payload === snapshot) return null;
    const remaining = this.callbacks.currentTokenSecondsRemaining();
    if (remaining === null || remaining <= this.freshThresholdSeconds) return null;
    return { status: 'adopted', payload };
  }

  private async renewExclusive(): Promise<RenewalResult> {
    const snapshot = this.callbacks.currentUserPayload();
    const outcome = await this.withExclusiveLock(async (): Promise<RenewalResult> => {
      // Double-check inside the lock: a peer may have renewed while we waited
      // and its fan-out was already adopted.
      const adopted = this.adoptedResult(snapshot);
      if (adopted) return adopted;

      const attempt = await this.callbacks.performRenewal();
      if (attempt.ok) {
        this.channel.post({ type: 'user-updated', payload: attempt.payload });
        return { status: 'renewed', payload: attempt.payload };
      }
      return { status: 'failed', reason: attempt.reason };
    });

    if (outcome !== 'lock-timeout') return outcome;
    // Timed out waiting: if the holder's fan-out reached us meanwhile, that IS
    // the renewal; otherwise fail safe — never refresh outside the lock.
    return this.adoptedResult(snapshot) ?? { status: 'failed', reason: 'lock-timeout' };
  }

  private async withExclusiveLock(
    fn: () => Promise<RenewalResult>,
  ): Promise<RenewalResult | 'lock-timeout'> {
    if (!this.locks) return fn();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.lockWaitTimeoutMs);
    try {
      return (await this.locks.request(
        this.lockName,
        { mode: 'exclusive', signal: controller.signal },
        () => fn(),
      )) as RenewalResult;
    } catch (error) {
      // Abort while WAITING rejects the request; abort after the grant is
      // ignored by the Web Locks spec, so this branch is precisely "never got
      // the lock in time".
      if (controller.signal.aborted) return 'lock-timeout';
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The browser's lock manager, or null when the API is unavailable. */
export function browserLocks(): Pick<LockManager, 'request'> | null {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
}
