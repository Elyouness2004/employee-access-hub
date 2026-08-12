/**
 * Session-renewal seam — how the HTTP layer asks authentication for ONE
 * controlled token renewal when a request comes back 401.
 *
 * The auth feature registers a renewer at bootstrap (it wraps the cross-tab
 * refresh coordinator, so a renewal here is still subject to the single-tab
 * refresh lock). When no renewer is registered — unauthenticated boot, dev
 * mock identity, after logout — 401s surface immediately with no replay.
 *
 * Single-flight: concurrent 401s share one renewal attempt; the renewer is
 * never invoked in parallel from this seam.
 */

/** Resolves a fresh access token, or `null` when the session cannot renew. */
export type SessionRenewer = () => Promise<string | null>;

let renewer: SessionRenewer | null = null;
let inFlight: Promise<string | null> | null = null;

/** Registered by the auth feature; unregistered (null) on logout/teardown. */
export function setSessionRenewer(next: SessionRenewer | null): void {
  renewer = next;
  inFlight = null;
}

/** Whether a 401 is even eligible for renew-and-replay right now. */
export function hasSessionRenewer(): boolean {
  return renewer !== null;
}

/**
 * Attempt one renewal (shared across concurrent callers). Resolves `null`
 * when renewal failed or no renewer is registered — callers must then let
 * the original 401 stand.
 */
export async function renewSession(): Promise<string | null> {
  const active = renewer;
  if (!active) return null;
  if (!inFlight) {
    inFlight = active()
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Test-only: restore the pristine (no-renewer) state. */
export function resetSessionRenewer(): void {
  renewer = null;
  inFlight = null;
}
