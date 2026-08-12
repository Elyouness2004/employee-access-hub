/**
 * The request gate — a hard stop on outbound API traffic while the session is
 * not usable (client-side idle lock, or a server-confirmed expiry).
 *
 * Why a gate rather than clearing the query cache: session expiry must no
 * longer destroy the page (FRONTEND-ARCHITECTURE §5.1). The route stays
 * mounted under the lock overlay with its data, filters and form input intact,
 * so *something* has to guarantee that a mounted page cannot keep talking to
 * the gateway. Blocking in the request interceptor does that at the only place
 * every call passes through — no component has to remember.
 *
 * Blocked calls never reach the network: they reject with the `unauthorized`
 * ApiError before a socket is opened, so no 401 storm, no renewal loop, and no
 * refresh grant that would reset Keycloak's idle clock for a page nobody is
 * using.
 */

let suspended = false;

/** Stop all outbound API traffic (session locked or expired). */
export function suspendRequests(): void {
  suspended = true;
}

/** Allow traffic again — only after the session has been verified. */
export function resumeRequests(): void {
  suspended = false;
}

export function areRequestsSuspended(): boolean {
  return suspended;
}
