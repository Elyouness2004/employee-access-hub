import { WebStorageStateStore } from 'oidc-client-ts';
import { describe, expect, it } from 'vitest';

import { env } from '@/config/env';

import { createUserManager } from './user-manager';

/**
 * The security-critical OIDC settings, asserted against the real
 * UserManager — not a fake. Provider tests inject a stub manager, so without
 * this file a change from in-memory to localStorage token storage (or a
 * re-enabled implicit flow) would keep the whole suite green.
 *
 * Every expectation traces to keycloak-config/realm-employee-hub.json.
 */
describe('createUserManager', () => {
  const settings = createUserManager().settings;

  it('uses the verified realm authority and public client', () => {
    expect(settings.authority).toBe(env.oidcAuthority);
    expect(settings.client_id).toBe(env.oidcClientId);
    // Public client: PKCE replaces a secret; there is none to ship.
    expect(settings.client_secret).toBeUndefined();
  });

  it('uses the Authorization Code flow — never implicit', () => {
    expect(settings.response_type).toBe('code');
    expect(settings.response_type).not.toContain('token');
    expect(settings.response_type).not.toContain('id_token');
  });

  it('requests exactly the scopes the client grants', () => {
    // web-portal default client scopes: roles, profile, basic, hub-api —
    // `roles` carries realm_access, `hub-api` the API audience.
    expect(settings.scope).toBe('openid profile roles hub-api');
  });

  it('keeps tokens in memory — never localStorage, sessionStorage, or IndexedDB', async () => {
    const store = settings.userStore;
    expect(store).toBeInstanceOf(WebStorageStateStore);

    // Behavioral, so it survives a library refactor: write through the store
    // the UserManager will actually use, then prove nothing reached a
    // persistent one.
    await store!.set('probe-key', 'probe-token-value');
    expect(await store!.get('probe-key')).toBe('probe-token-value');
    expect(JSON.stringify(localStorage)).not.toContain('probe-token-value');
    expect(JSON.stringify(sessionStorage)).not.toContain('probe-token-value');
    expect(localStorage.getItem('probe-key')).toBeNull();
    expect(sessionStorage.getItem('probe-key')).toBeNull();
    await store!.remove('probe-key');
  });

  it('leaves automatic silent renew OFF (renewal goes through the cross-tab lock)', () => {
    // The realm rotates refresh tokens with zero reuse: an uncoordinated
    // library timer could refresh concurrently with another tab and revoke
    // the session.
    expect(settings.automaticSilentRenew).toBe(false);
  });

  it('raises the expiring event 60 s before expiry (300 s access tokens)', () => {
    expect(settings.accessTokenExpiringNotificationTimeInSeconds).toBe(60);
  });

  it('points redirects at the configured, realm-authorized endpoints', () => {
    expect(settings.redirect_uri).toBe(env.oidcRedirectUri);
    expect(settings.post_logout_redirect_uri).toBe(env.oidcPostLogoutRedirectUri);
    expect(settings.silent_redirect_uri).toBe(env.oidcSilentRedirectUri);
    // Origin-derived defaults must stay same-origin — the realm authorizes
    // http://localhost:5173/* and :3000/*.
    for (const uri of [
      settings.redirect_uri,
      settings.post_logout_redirect_uri,
      settings.silent_redirect_uri,
    ]) {
      expect(new URL(uri!).origin).toBe(window.location.origin);
    }
  });
});
