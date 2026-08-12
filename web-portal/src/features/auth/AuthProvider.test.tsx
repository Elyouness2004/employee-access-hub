import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorResponse, User } from 'oidc-client-ts';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccessToken, renewSession, resetSessionRenewer } from '@/shared/api';
import { useSessionControls } from '@/shared/auth';

import { AuthProvider, useAuth, type AuthProviderDeps } from './AuthProvider';
import type { AuthChannel } from './cross-tab/auth-channel';
import { FakeLockManager, fakeUser, fakeUserManager, linkedChannels } from './test-support';

/**
 * Provider-level behavior: bootstrap restore, login/callback/logout, identity
 * exposure through the shared contract, cross-tab adoption and propagation,
 * and the shared/api seams (token provider + 401 renewer).
 */

function Probe() {
  const { state } = useAuth();
  const controls = useSessionControls();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="reason">{state.status === 'unauthenticated' ? state.reason : 'n/a'}</span>
      {state.status === 'authenticated' ? (
        <>
          <span data-testid="subject">{state.identity.subject}</span>
          <span data-testid="roles">{state.identity.roles.join(',')}</span>
        </>
      ) : null}
      <button type="button" onClick={() => controls?.signOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderProvider(deps: AuthProviderDeps, children: ReactNode = <Probe />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider mode="oidc" deps={deps}>
          {children}
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

let channels: AuthChannel[];
let locks: FakeLockManager;

beforeEach(() => {
  channels = linkedChannels(2);
  locks = new FakeLockManager();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  resetSessionRenewer();
});

describe('AuthProvider — bootstrap', () => {
  it('starts in restoring and never exposes an identity before it resolves', () => {
    const manager = fakeUserManager({ getUser: vi.fn(() => new Promise(() => undefined)) });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });

    expect(screen.getByTestId('status')).toHaveTextContent('restoring');
    expect(screen.queryByTestId('subject')).not.toBeInTheDocument();
  });

  it('restores a session silently from the SSO cookie', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockResolvedValue(fakeUser({ roles: ['HR', 'EMPLOYEE'] })),
    });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roles')).toHaveTextContent('HR,EMPLOYEE');
    expect(await getAccessToken()).toBeTruthy();
  });

  it('lands unauthenticated (no-session) when no session exists anywhere', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'login_required' })),
    });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('reason')).toHaveTextContent('no-session');
    expect(await getAccessToken()).toBeNull();
  });

  it('adopts a session handed over by an already-open tab (no second refresh)', async () => {
    const existing = fakeUser({ sub: 'kc-handoff', roles: ['MANAGER', 'EMPLOYEE'] });
    // Peer tab answers handoff requests.
    channels[1]!.subscribe((message) => {
      if (message.type === 'handoff-request') {
        channels[1]!.post({
          type: 'handoff-response',
          requestId: message.requestId,
          payload: existing.toStorageString(),
        });
      }
    });
    const manager = fakeUserManager();
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 50 });

    await waitFor(() => expect(screen.getByTestId('subject')).toHaveTextContent('kc-handoff'));
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('does not attempt a silent restore on the callback route (no race)', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const manager = fakeUserManager();
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(manager.getUser).not.toHaveBeenCalled();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — login and callback', () => {
  it('starts the redirect carrying a sanitized return path', async () => {
    const manager = fakeUserManager();
    function SignIn() {
      const { signIn } = useAuth();
      return (
        <button type="button" onClick={() => void signIn('/leave?page=2')}>
          Go
        </button>
      );
    }
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, <SignIn />);

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/leave?page=2' } });
  });

  it('rejects an unsafe return path at redirect time', async () => {
    const manager = fakeUserManager();
    function SignIn() {
      const { signIn } = useAuth();
      return (
        <button type="button" onClick={() => void signIn('https://evil.example/x')}>
          Go
        </button>
      );
    }
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, <SignIn />);

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/' } });
  });

  it('completes the code exchange, authenticates, and returns the safe path', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const user = fakeUser({ sub: 'kc-callback', state: { returnTo: '/expenses' } });
    const manager = fakeUserManager({ signinRedirectCallback: vi.fn().mockResolvedValue(user) });
    let resolved: string | undefined;
    function Complete() {
      const { completeSignIn } = useAuth();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void completeSignIn().then((path) => {
                resolved = path;
              });
            }}
          >
            Complete
          </button>
          <Probe />
        </>
      );
    }
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, <Complete />);

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(resolved).toBe('/expenses'));
    expect(screen.getByTestId('subject')).toHaveTextContent('kc-callback');
  });

  it('sanitizes a hostile return path arriving in the OIDC state', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const user = fakeUser({ state: { returnTo: '//evil.example/steal' } });
    const manager = fakeUserManager({ signinRedirectCallback: vi.fn().mockResolvedValue(user) });
    let resolved: string | undefined;
    function Complete() {
      const { completeSignIn } = useAuth();
      return (
        <button
          type="button"
          onClick={() => {
            void completeSignIn().then((path) => {
              resolved = path;
            });
          }}
        >
          Complete
        </button>
      );
    }
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, <Complete />);

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(resolved).toBe('/'));
  });
});

describe('AuthProvider — logout', () => {
  it('clears state and cache first, propagates to tabs, then redirects to Keycloak', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockResolvedValue(fakeUser()),
    });
    const peerMessages: string[] = [];
    channels[1]!.subscribe((message) => peerMessages.push(message.type));

    const { queryClient } = renderProvider({
      manager,
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    queryClient.setQueryData(['leave', 'my'], { content: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('reason')).toHaveTextContent('signed-out');
    expect(queryClient.getQueryData(['leave', 'my'])).toBeUndefined();
    expect(peerMessages).toContain('signed-out');
    expect(manager.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(await getAccessToken()).toBeNull();
  });

  it('adopts a peer logout (cross-tab sign-out)', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    channels[1]!.post({ type: 'signed-out' });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('reason')).toHaveTextContent('signed-out');
    expect(await getAccessToken()).toBeNull();
  });
});

describe('AuthProvider — session lifecycle across tabs', () => {
  it('adopts a token another tab refreshed', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockResolvedValue(fakeUser({ sub: 'kc-1', roles: ['EMPLOYEE'] })),
    });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });
    await waitFor(() => expect(screen.getByTestId('subject')).toHaveTextContent('kc-1'));

    const renewed = fakeUser({ sub: 'kc-1', roles: ['MANAGER', 'EMPLOYEE'] });
    channels[1]!.post({ type: 'user-updated', payload: renewed.toStorageString() });

    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('MANAGER,EMPLOYEE'));
    expect(await getAccessToken()).toBe(renewed.access_token);
  });

  it('adopts a peer session-expiry announcement', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    renderProvider({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    channels[1]!.post({ type: 'session-expired' });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('expired'));
    expect(await getAccessToken()).toBeNull();
  });
});

describe('AuthProvider — shared/api renewal seam', () => {
  it('renews on demand and yields the fresh token to the HTTP layer', async () => {
    const first = fakeUser({ sub: 'kc-1' });
    const second = fakeUser({ sub: 'kc-1' });
    const signinSilent = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    renderProvider({
      manager: fakeUserManager({ signinSilent }),
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await expect(renewSession()).resolves.toBe(second.access_token);
  });

  it('reports renewal failure and transitions to expired (session gone)', async () => {
    const signinSilent = vi
      .fn()
      .mockResolvedValueOnce(fakeUser())
      .mockRejectedValueOnce(new ErrorResponse({ error: 'invalid_grant' }));
    renderProvider({
      manager: fakeUserManager({ signinSilent }),
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await expect(renewSession()).resolves.toBeNull();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('expired'));
  });

  it('does not renew when no session exists (nothing to replay)', async () => {
    const signinSilent = vi.fn().mockRejectedValue(new ErrorResponse({ error: 'login_required' }));
    renderProvider({
      manager: fakeUserManager({ signinSilent }),
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    signinSilent.mockClear();
    await expect(renewSession()).resolves.toBeNull();
    expect(signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — scheduled renewal respects the SSO idle timeout', () => {
  function setVisibility(value: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('does not refresh while the tab is hidden, then renews when it returns', async () => {
    // Every refresh grant resets Keycloak's idle timer: a background tab
    // renewing on a schedule would keep an abandoned session alive for the
    // full 8h max lifespan and defeat the realm's 30-minute idle timeout.
    vi.useFakeTimers();
    const first = fakeUser({ sub: 'kc-1', expiresIn: 70 }); // renewal due in ~10s
    const second = fakeUser({ sub: 'kc-1', expiresIn: 300 });
    const signinSilent = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    renderProvider({
      manager: fakeUserManager({ signinSilent }),
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });

    await vi.advanceTimersByTimeAsync(100); // boot: handoff timeout → silent restore
    expect(signinSilent).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000); // well past the renewal moment
    expect(signinSilent).toHaveBeenCalledTimes(1); // still only the restore

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0); // the deferred renewal runs now
    expect(signinSilent).toHaveBeenCalledTimes(2);
  });
});

describe('AuthProvider — token storage discipline', () => {
  it('persists no token to localStorage, sessionStorage, or a cookie', async () => {
    const user = fakeUser();
    renderProvider({
      manager: fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(user) }),
      channel: channels[0],
      locks,
      handoffTimeoutMs: 5,
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    const dump = [
      JSON.stringify(localStorage),
      JSON.stringify(sessionStorage),
      document.cookie,
    ].join('|');
    expect(dump).not.toContain(user.access_token);
    expect(dump).not.toContain(user.refresh_token ?? 'refresh-token-1');
  });
});

describe('AuthProvider — disabled mode (dev mock identity)', () => {
  it('builds no OIDC plumbing and exposes no session controls', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider mode="disabled">
            <ModeProbe />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mode')).toHaveTextContent('disabled');
    expect(screen.getByTestId('controls')).toHaveTextContent('none');
  });
});

function ModeProbe() {
  const { mode } = useAuth();
  const controls = useSessionControls();
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <span data-testid="controls">{controls ? 'present' : 'none'}</span>
    </>
  );
}

describe('User serialization round-trip (cross-tab payloads)', () => {
  it('survives toStorageString/fromStorageString with claims intact', () => {
    const user = fakeUser({ sub: 'kc-round', roles: ['ADMIN', 'EMPLOYEE'] });
    const restored = User.fromStorageString(user.toStorageString());
    expect(restored.access_token).toBe(user.access_token);
  });
});
