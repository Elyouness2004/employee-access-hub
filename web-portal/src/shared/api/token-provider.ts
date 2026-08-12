/**
 * Authorization token provider — Phase 2 seam.
 *
 * Real authentication (oidc-client-ts) will register a provider that returns
 * the in-memory access token. Until then the provider yields `null` and the
 * client sends no Authorization header. Tokens are NEVER stored here, never
 * persisted, and never fabricated in development.
 */

export type AccessTokenProvider = () => string | null | Promise<string | null>;

let provider: AccessTokenProvider = () => null;

/** Called once by the auth feature (Phase 2) during bootstrap. */
export function setAccessTokenProvider(next: AccessTokenProvider): void {
  provider = next;
}

/** Used by the request interceptor; resolves to null when unauthenticated. */
export async function getAccessToken(): Promise<string | null> {
  return provider();
}

/** Test-only hook to restore the default (no-token) provider. */
export function resetAccessTokenProvider(): void {
  provider = () => null;
}
