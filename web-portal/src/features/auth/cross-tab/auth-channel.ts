/**
 * Same-origin auth event channel between browser tabs.
 *
 * Carries session lifecycle fan-out (fresh token adoption, expiry, logout)
 * and the new-tab session handoff. Nothing is persisted: messages exist only
 * in flight between same-origin tabs.
 *
 * ⚠ The `user-updated` and `handoff-response` payloads are the serialized
 * OIDC user, which INCLUDES the refresh token. A same-origin script could
 * subscribe and read it — a lower bar than extracting it from the app's
 * closures. This is an accepted, recorded trade-off: handing over the full
 * user is what keeps every tab on ONE refresh-token lineage, and the realm
 * revokes the session when two lineages exist (`refreshTokenMaxReuse: 0`).
 * Rationale and the alternative considered: FRONTEND-ARCHITECTURE §5.1.
 */

import type { SessionEndReason } from '../session/ended-copy';

export type AuthChannelMessage =
  /** A tab holds a newer OIDC user (login, renewal); others adopt it. */
  | { type: 'user-updated'; payload: string }
  /**
   * The session ended somewhere — every tab shows the same end state. The
   * reason travels with it so peers do not downgrade an advisory idle lock
   * into "Keycloak rejected you" (or the reverse). Absent = server-confirmed,
   * the only reason that existed before the idle model.
   */
  | { type: 'session-expired'; reason?: SessionEndReason }
  /** User-initiated logout — every tab returns to the entry point. */
  | { type: 'signed-out' }
  /** A booting tab asks peers for the current session. */
  | { type: 'handoff-request'; requestId: string }
  /** A signed-in peer answers a handoff request. */
  | { type: 'handoff-response'; requestId: string; payload: string }
  /**
   * A person interacted with one tab (throttled, epoch ms). Peers advance
   * their idle clock so working in one tab never locks the others. Carries no
   * token material — just a timestamp.
   */
  | { type: 'user-activity'; at: number }
  /**
   * A locked tab was revived through a VERIFIED continue-session. Peers unlock
   * and restart their idle clock from the same instant, so the browser never
   * shows one tab working and another locked.
   */
  | { type: 'session-continued'; at: number };

export interface AuthChannel {
  post(message: AuthChannelMessage): void;
  subscribe(listener: (message: AuthChannelMessage) => void): () => void;
  close(): void;
}

export const AUTH_CHANNEL_NAME = 'eah:auth';

function isAuthChannelMessage(value: unknown): value is AuthChannelMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * BroadcastChannel-backed implementation. Where BroadcastChannel is missing
 * the channel degrades to inert: single-tab behavior stays fully correct,
 * cross-tab coordination simply has no peers to reach.
 */
export function createAuthChannel(): AuthChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => undefined, subscribe: () => () => undefined, close: () => undefined };
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  const listeners = new Set<(message: AuthChannelMessage) => void>();
  let closed = false;

  channel.onmessage = (event: MessageEvent) => {
    if (!isAuthChannelMessage(event.data)) return;
    for (const listener of listeners) listener(event.data);
  };

  return {
    /**
     * `postMessage` on a closed BroadcastChannel throws `InvalidStateError`, and
     * posting after close is genuinely reachable: async work started before
     * teardown (the boot handoff request, an in-flight renewal broadcasting its
     * fresh user) resumes holding a reference to the closed channel. React's
     * StrictMode makes it happen on every dev boot by mounting, tearing down and
     * re-mounting the provider effect.
     *
     * A closed channel has no peers, so dropping the message is the correct
     * outcome — the same inert degradation as a runtime without BroadcastChannel.
     * Throwing instead would surface as an unhandled rejection that aborts
     * whatever session work was in flight.
     */
    post: (message) => {
      if (closed) return;
      channel.postMessage(message);
    },
    subscribe: (listener) => {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      if (closed) return;
      closed = true;
      listeners.clear();
      channel.close();
    },
  };
}
