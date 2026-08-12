import { User, type UserManager } from 'oidc-client-ts';
import { vi } from 'vitest';

import type { Role } from '@/shared/auth';

import type { AuthChannel, AuthChannelMessage } from './cross-tab/auth-channel';

/**
 * Deterministic fixtures for auth tests: unsigned JWTs with real claim shapes
 * (the realm puts realm_access.roles in the ACCESS token), real oidc-client-ts
 * User objects, an in-process Web Locks fake honoring exclusive queuing +
 * abort, and synchronously-linked channels simulating multiple tabs.
 * Test-only module — never imported by production code.
 */

export function fakeJwt(payload: Record<string, unknown>): string {
  // base64url over UTF-8 bytes, exactly as a real issuer encodes claims.
  const encode = (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const binary = String.fromCharCode(...bytes);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.test-signature`;
}

export interface FakeUserOptions {
  sub?: string;
  username?: string;
  /** `null` omits the claim entirely (Keycloak users without a full name). */
  name?: string | null;
  roles?: readonly Role[] | readonly string[];
  /** Seconds until access-token expiry (default 300 — the realm lifespan). */
  expiresIn?: number;
  refreshToken?: string;
  /** OIDC state round-tripped through signin (e.g. { returnTo }). */
  state?: unknown;
  /**
   * `auth_time` claim in SECONDS (when the session was authenticated). Drives
   * the absolute-lifetime deadline; omitted means the claim is absent, which
   * the client treats as "lifetime not trackable".
   */
  authTime?: number;
}

export function fakeUser({
  sub = 'kc-subject-1',
  username = 'alice.employee',
  name = 'Alice Employee',
  roles = ['EMPLOYEE'],
  expiresIn = 300,
  refreshToken = 'refresh-token-1',
  state,
  authTime,
}: FakeUserOptions = {}): User {
  const now = Math.floor(Date.now() / 1000);
  return new User({
    access_token: fakeJwt({
      sub,
      preferred_username: username,
      ...(name === null ? {} : { name }),
      realm_access: { roles: [...roles] },
      exp: now + expiresIn,
    }),
    token_type: 'Bearer',
    refresh_token: refreshToken,
    expires_at: now + expiresIn,
    profile: {
      sub,
      iss: 'test',
      aud: 'web-portal',
      exp: now + expiresIn,
      iat: now,
      ...(authTime === undefined ? {} : { auth_time: authTime }),
    },
    ...(state !== undefined ? { userState: state } : {}),
  });
}

/** A UserManager whose every method is a controllable spy. */
export function fakeUserManager(overrides: Partial<Record<keyof UserManager, unknown>> = {}) {
  const manager = {
    getUser: vi.fn().mockResolvedValue(null),
    signinSilent: vi.fn().mockResolvedValue(null),
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signinRedirectCallback: vi.fn().mockRejectedValue(new Error('no callback configured')),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
    storeUser: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return manager as unknown as UserManager & typeof manager;
}

/**
 * Exclusive-lock fake with the Web Locks queuing + abort semantics the
 * coordinator relies on: FIFO per name, abort-while-waiting rejects with
 * AbortError, abort-after-grant is ignored.
 */
export class FakeLockManager {
  private tails = new Map<string, Promise<void>>();

  request: Pick<LockManager, 'request'>['request'] = async (
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => unknown),
    maybeCallback?: (lock: Lock | null) => unknown,
  ) => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = (
      typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    ) as (lock: Lock | null) => unknown;

    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      name,
      previous.then(() => held),
    );

    const signal = options.signal;
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (signal) {
      await Promise.race([
        previous,
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
      ]).catch((error: unknown) => {
        release();
        throw error;
      });
    } else {
      await previous;
    }

    try {
      return await callback({ name, mode: 'exclusive' } as Lock);
    } finally {
      release();
    }
  };
}

/** N channels where a post on one is delivered synchronously to the others. */
export function linkedChannels(count: number): AuthChannel[] {
  const rooms: Array<Set<(message: AuthChannelMessage) => void>> = Array.from(
    { length: count },
    () => new Set(),
  );
  return rooms.map((listeners, index) => ({
    post: (message: AuthChannelMessage) => {
      rooms.forEach((peers, peerIndex) => {
        if (peerIndex === index) return;
        for (const listener of [...peers]) listener(message);
      });
    },
    subscribe: (listener: (message: AuthChannelMessage) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => listeners.clear(),
  }));
}
