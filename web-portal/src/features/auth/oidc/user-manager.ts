import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';

import { env } from '@/config/env';

/**
 * The single UserManager for the verified realm configuration
 * (keycloak-config/realm-employee-hub.json):
 *
 *   realm `employee-hub` · public client `web-portal` · Authorization Code +
 *   PKCE S256 enforced (`pkce.code.challenge.method: S256`) · no implicit flow ·
 *   access token 300 s · refresh rotation with `refreshTokenMaxReuse: 0` ·
 *   redirect URIs `http://localhost:5173/*` + `http://localhost:3000/*` ·
 *   post-logout redirect URIs mirror them (`+`).
 *
 * Browser-storage decisions (documented; see web-portal/README.md):
 *  - `userStore` = in-memory. Tokens (access AND refresh) live only in this
 *    tab's JS heap — never localStorage, sessionStorage, or IndexedDB. A
 *    reload restores the session silently from the Keycloak SSO cookie; other
 *    open tabs hand the session over via BroadcastChannel.
 *  - `stateStore` = sessionStorage (library default): PKCE verifier, state and
 *    nonce for the in-flight redirect ONLY — short-lived protocol transaction
 *    state that must survive the round-trip to Keycloak. No tokens ever.
 *  - `automaticSilentRenew` = false: renewal is driven exclusively through the
 *    cross-tab refresh coordinator so the realm's rotation-with-zero-reuse
 *    policy can never see two concurrent refreshes (which would revoke the
 *    whole session).
 */
export function createUserManager(): UserManager {
  return new UserManager({
    authority: env.oidcAuthority,
    client_id: env.oidcClientId,
    redirect_uri: env.oidcRedirectUri,
    post_logout_redirect_uri: env.oidcPostLogoutRedirectUri,
    silent_redirect_uri: env.oidcSilentRedirectUri,
    response_type: 'code',
    // Scopes per FRONTEND-ARCHITECTURE §5; all are default client scopes of
    // web-portal, and `roles`/`hub-api` put realm_access + audience into the
    // access token.
    scope: 'openid profile roles hub-api',
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    automaticSilentRenew: false,
    // Raise `accessTokenExpiring` 60 s before expiry (300 s lifespan → renew
    // at ~240 s), matching the approved renewal window.
    accessTokenExpiringNotificationTimeInSeconds: 60,
    // Session state is tracked through renewal outcomes + cross-tab events;
    // the check-session iframe adds a second signal path we don't consume.
    monitorSession: false,
    // Left at the default (false) deliberately: the end-session redirect
    // terminates the SSO session server-side, which already invalidates the
    // refresh token. Revoking first adds a call whose failure would REJECT
    // signoutRedirect before the redirect happens — a "sign out" that leaves
    // the SSO cookie alive and silently signs the user back in. Worse failure
    // mode than the marginal hygiene gain.
    revokeTokensOnSignout: false,
    // Claims come from the tokens themselves — no userinfo round trip.
    loadUserInfo: false,
  });
}

let singleton: UserManager | null = null;

/** Lazily created so mock-identity dev builds never construct OIDC plumbing. */
export function getUserManager(): UserManager {
  singleton ??= createUserManager();
  return singleton;
}
