/**
 * Post-login return-path safety (open-redirect prevention).
 *
 * The intended route travels through the OIDC `state` parameter and comes
 * back from the authorization server, so it must be treated as untrusted
 * input. Only in-app paths are ever navigated to:
 *
 *  - control characters and whitespace are rejected outright: the URL parser
 *    strips tabs/newlines, so `/\t/host` would resolve to another origin and
 *    throw at `pushState` time;
 *  - must be a string starting with exactly one `/` (rejects absolute URLs,
 *    `//host` network-path references, and `/\host` backslash tricks);
 *  - auth plumbing routes are not meaningful destinations → home instead.
 *
 * Navigation uses the router (`navigate(path)`), never `window.location`,
 * so the origin can never change.
 */

export const HOME_PATH = '/';

const AUTH_PATHS = ['/login', '/auth/callback', '/auth/silent'];

/** Characters a URL parser strips or that never belong in an in-app path. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0020\u007F]/;

export function sanitizeReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string') return HOME_PATH;
  if (UNSAFE_CHARS.test(candidate)) return HOME_PATH;
  if (!candidate.startsWith('/')) return HOME_PATH;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return HOME_PATH;
  const pathOnly = candidate.split(/[?#]/, 1)[0] ?? candidate;
  if (AUTH_PATHS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return HOME_PATH;
  return candidate;
}

/** The current in-app location as a return path (path + search + hash). */
export function currentReturnPath(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  return sanitizeReturnPath(`${location.pathname}${location.search}${location.hash}`);
}
