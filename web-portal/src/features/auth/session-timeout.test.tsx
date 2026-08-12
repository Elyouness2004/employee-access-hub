import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorResponse } from 'oidc-client-ts';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { areRequestsSuspended, resetSessionRenewer, resumeRequests } from '@/shared/api';
import { setViewport } from '@/shared/testing/setup';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

import { AuthProvider, type AuthProviderDeps } from './AuthProvider';
import { SessionExpiryWarning } from './components/SessionExpiryWarning';
import { RequireAuth } from './guards/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { sessionPolicy, type SessionPolicy } from './session/session-policy';
import { FakeLockManager, fakeUser, fakeUserManager, linkedChannels } from './test-support';

/**
 * Stage-1 session-timeout UX, end to end through the real provider:
 * the advisory idle clock, the pre-expiry warning, continue-session, the lock
 * overlay above a still-mounted page, cross-tab propagation and recovery.
 *
 * The policy is scaled down (10 s idle / 4 s warning / 40 s cap) but the
 * SHAPE is the realm's, so every assertion here holds at 30 min / 8 h.
 */
const POLICY: SessionPolicy = sessionPolicy({
  idleTimeoutMs: 10_000,
  warningMs: 4_000,
  maxLifetimeMs: 40_000,
  // The cap gets a longer lead in production (5 min); scaled here so the two
  // deadlines stay distinguishable.
  lifetimeWarningMs: 8_000,
});

/** A protected page carrying unsaved work, so preservation is observable. */
function WorkInProgressPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <label htmlFor="reason">Reason</label>
      <input id="reason" defaultValue="" />
    </main>
  );
}

function renderApp(deps: AuthProviderDeps, initialPath = '/') {
  const routes: RouteObject[] = [
    { path: '/login', element: <LoginPage /> },
    {
      element: <RequireAuth />,
      children: [
        {
          path: '/',
          element: (
            <>
              <SessionExpiryWarning />
              <WorkInProgressPage />
            </>
          ),
        },
        { path: '/leave', element: <WorkInProgressPage /> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    router,
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider mode="oidc" deps={{ sessionPolicy: POLICY, ...deps }}>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  };
}

let channels: ReturnType<typeof linkedChannels>;
let locks: FakeLockManager;

/** A signed-in tab whose token never expires during the test window. */
function signedInDeps(overrides: Partial<AuthProviderDeps> = {}): AuthProviderDeps {
  return {
    manager: fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) }),
    channel: channels[0]!,
    locks,
    handoffTimeoutMs: 5,
    ...overrides,
  };
}

/** Move the shared clock (timers + Date.now) and let React settle. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  resetSessionRenewer();
  resumeRequests();
  channels = linkedChannels(2);
  locks = new FakeLockManager();
  window.history.pushState({}, '', '/');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  resumeRequests();
});

describe('expiry warning', () => {
  it('warns ahead of the idle limit, states the remaining time, and offers both ways out', async () => {
    const { baseElement } = renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    expect(screen.queryByText(/about to expire/i)).not.toBeInTheDocument();

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);

    expect(await screen.findByText(/your session is about to expire/i)).toBeVisible();
    expect(screen.getByText(/inactive for a while/i)).toHaveTextContent(/4 seconds/);
    expect(screen.getByRole('button', { name: /continue session/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /sign in again/i })).toBeVisible();
    // The page is untouched and still usable — the warning does not cover it.
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('counts down visually while the announced text stays a stable, true range', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);

    // Live regions are atomic, so the bar itself is NOT one: exactly one small
    // node announces, and it speaks a range rather than a per-second value.
    const announcement = await screen.findByRole('alert');
    expect(announcement).toHaveTextContent(/your session expires in less than a minute/i);
    const visible = screen.getByText(/inactive for a while/i);
    expect(visible).toHaveTextContent(/4 seconds/);

    advance(2_000);
    await waitFor(() => expect(visible).toHaveTextContent(/2 seconds/));
    // The visible figure ticked; the spoken one did not move.
    expect(announcement).toHaveTextContent(/less than a minute/);
  });

  it('disappears when the person interacts with the page again', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);
    await screen.findByText(/your session is about to expire/i);

    await user().type(screen.getByLabelText('Reason'), 'a');

    await waitFor(() =>
      expect(screen.queryByText(/your session is about to expire/i)).not.toBeInTheDocument(),
    );
  });
});

describe('continue session', () => {
  it('verifies with the authorization server, then resumes in place', async () => {
    const signinSilent = vi.fn().mockResolvedValue(fakeUser());
    const deps = signedInDeps({ manager: fakeUserManager({ signinSilent }) });
    const { router } = renderApp(deps);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user().type(screen.getByLabelText('Reason'), 'annual leave');

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);
    await screen.findByText(/your session is about to expire/i);
    const callsBefore = signinSilent.mock.calls.length;

    await user().click(screen.getByRole('button', { name: /continue session/i }));

    await waitFor(() =>
      expect(screen.queryByText(/your session is about to expire/i)).not.toBeInTheDocument(),
    );
    // A real renewal was attempted — the local timer alone never counts as proof.
    expect(signinSilent.mock.calls.length).toBeGreaterThan(callsBefore);
    // Route, page and unsaved input all survive.
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByLabelText('Reason')).toHaveValue('annual leave');
  });

  it('moves to the expired state — not a fake success — when Keycloak refuses', async () => {
    const signinSilent = vi
      .fn()
      .mockResolvedValueOnce(fakeUser())
      .mockRejectedValue(new ErrorResponse({ error: 'invalid_grant' }));
    const { router } = renderApp(signedInDeps({ manager: fakeUserManager({ signinSilent }) }));
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);
    await screen.findByText(/your session is about to expire/i);
    await user().click(screen.getByRole('button', { name: /continue session/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/your session has expired/i);
    expect(dialog).not.toHaveTextContent(/paused after inactivity/i);
    expect(router.state.location.pathname).toBe('/');
  });

  it('says the identity provider was unreachable rather than claiming expiry', async () => {
    const signinSilent = vi
      .fn()
      .mockResolvedValueOnce(fakeUser())
      .mockRejectedValue(new Error('network down'));
    renderApp(signedInDeps({ manager: fakeUserManager({ signinSilent }) }));
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');
    await user().click(within(dialog).getByRole('button', { name: /continue session/i }));

    expect(await within(dialog).findByText(/could not reach the identity provider/i)).toBeVisible();
    // Still locked, and still honest about not knowing.
    expect(dialog).toHaveTextContent(/paused after inactivity/i);
    expect(dialog).not.toHaveTextContent(/no longer valid/i);
    expect(areRequestsSuspended()).toBe(true);
  });

  it('is offered — with an honest caveat — but never promises the redirect keeps your work', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(/nothing on this page is lost/i);
    expect(dialog).toHaveTextContent(/reloads the application/i);
    expect(dialog).toHaveTextContent(/typed and not saved will be lost/i);
  });
});

describe('locked session overlay', () => {
  it('locks the page in place, keeping route, page and unsaved input', async () => {
    const { router, baseElement } = renderApp(signedInDeps(), '/leave');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user().type(screen.getByLabelText('Reason'), 'draft text');

    advance(POLICY.idleTimeoutMs);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/session paused after inactivity/i);
    // The advisory client timer must not claim Keycloak ended the session.
    expect(dialog).not.toHaveTextContent(/has expired/i);
    expect(router.state.location.pathname).toBe('/leave');
    expect(screen.getByRole('heading', { name: 'Dashboard', hidden: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Reason', { selector: 'input' })).toHaveValue('draft text');
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('stops the page talking to the gateway while it is locked', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(areRequestsSuspended()).toBe(false);

    advance(POLICY.idleTimeoutMs);
    await screen.findByRole('alertdialog');

    expect(areRequestsSuspended()).toBe(true);
  });

  it('traps focus and refuses to be dismissed by Escape', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });
    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user().keyboard('{Tab}');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user().keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('reopens the gate and refreshes the page after a verified continue', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user().type(screen.getByLabelText('Reason'), 'kept');

    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');
    await user().click(within(dialog).getByRole('button', { name: /continue session/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(areRequestsSuspended()).toBe(false);
    expect(screen.getByLabelText('Reason')).toHaveValue('kept');
  });

  it('sends the current route to Keycloak so re-authentication returns to it', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    renderApp(signedInDeps({ manager }), '/leave');
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');
    await user().click(within(dialog).getByRole('button', { name: /sign in again/i }));

    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/leave' } });
  });

  it('renders as a full-width sheet on a phone', async () => {
    setViewport(375);
    const { baseElement } = renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs);
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByRole('button', { name: /continue session/i })).toBeVisible();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('absolute maximum lifetime', () => {
  it('never offers to extend a session that has reached its cap', async () => {
    // Authenticated long enough ago that the cap is the nearest deadline.
    const authTime = Math.floor((Date.now() - (POLICY.maxLifetimeMs - 3_000)) / 1000);
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockResolvedValue(fakeUser({ authTime })),
    });
    renderApp(signedInDeps({ manager }));
    await screen.findByRole('heading', { name: 'Dashboard' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be extended/i);
    expect(screen.queryByRole('button', { name: /continue session/i })).toBeNull();

    advance(4_000);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/reached its time limit/i);
    expect(within(dialog).queryByRole('button', { name: /continue session/i })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /sign in again/i })).toBeVisible();
  });
});

describe('across tabs', () => {
  it('keeps a tab alive while the person works in another one', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    advance(POLICY.idleTimeoutMs - POLICY.warningMs);
    await screen.findByText(/your session is about to expire/i);

    act(() => channels[1]!.post({ type: 'user-activity', at: Date.now() }));

    await waitFor(() =>
      expect(screen.queryByText(/your session is about to expire/i)).not.toBeInTheDocument(),
    );
  });

  it('propagates a peer’s idle lock with the peer’s reason, not a harsher one', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    act(() => channels[1]!.post({ type: 'session-expired', reason: 'idle' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/paused after inactivity/i);
    expect(dialog).not.toHaveTextContent(/has expired/i);
  });

  it('unlocks every tab when one of them continues the session', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });
    advance(POLICY.idleTimeoutMs);
    await screen.findByRole('alertdialog');

    act(() => {
      channels[1]!.post({ type: 'user-updated', payload: fakeUser().toStorageString() });
      channels[1]!.post({ type: 'session-continued', at: Date.now() });
    });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(areRequestsSuspended()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  it('does not let a peer’s token renewal silently unlock a locked tab', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });
    advance(POLICY.idleTimeoutMs);
    await screen.findByRole('alertdialog');

    act(() => channels[1]!.post({ type: 'user-updated', payload: fakeUser().toStorageString() }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(areRequestsSuspended()).toBe(true);
  });

  it('still propagates sign-out, which ends the session rather than locking it', async () => {
    const { router } = renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    act(() => channels[1]!.post({ type: 'signed-out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(areRequestsSuspended()).toBe(false);
  });
});

describe('the identity provider cannot be reached', () => {
  /**
   * The renewal timer keeps failing on the network until the access token is
   * gone. We never got an answer from Keycloak, so the session's fate is
   * genuinely unknown — and saying "your session is no longer valid" would be
   * a claim this client cannot make.
   */
  function unreachableDeps() {
    const signinSilent = vi
      .fn()
      .mockResolvedValueOnce(fakeUser({ expiresIn: 70 }))
      .mockRejectedValue(new Error('network down'));
    return { manager: fakeUserManager({ signinSilent }), signinSilent };
  }

  /** Run the renewal timer past its retries until the token is spent. */
  function exhaustRenewals() {
    for (let attempt = 0; attempt < 5; attempt += 1) advance(21_000);
  }

  it('locks with an honest "could not confirm" state, never claiming expiry', async () => {
    const { manager } = unreachableDeps();
    const { baseElement } = renderApp(signedInDeps({ manager }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user().type(screen.getByLabelText('Reason'), 'draft');

    exhaustRenewals();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/session could not be confirmed/i);
    expect(dialog).toHaveTextContent(/could not reach the identity provider/i);
    expect(dialog).not.toHaveTextContent(/no longer valid/i);
    expect(dialog).not.toHaveTextContent(/paused after inactivity/i);
    // Recoverable, so it offers the retry rather than only a redirect.
    expect(within(dialog).getByRole('button', { name: /try again/i })).toBeVisible();
    // And the page it locked is intact underneath.
    expect(screen.getByLabelText('Reason', { selector: 'input' })).toHaveValue('draft');
    expect(areRequestsSuspended()).toBe(true);
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('keeps the refresh token, so retrying once the network returns resumes in place', async () => {
    let booted = false;
    let online = false;
    const signinSilent = vi.fn(async () => {
      if (!booted) {
        booted = true;
        return fakeUser({ expiresIn: 70 });
      }
      if (!online) throw new Error('network down');
      return fakeUser();
    });
    const manager = fakeUserManager({ signinSilent });
    renderApp(signedInDeps({ manager }));
    await screen.findByRole('heading', { name: 'Dashboard' });

    exhaustRenewals();
    const dialog = await screen.findByRole('alertdialog');
    // The point of this state: an unverified failure must not throw the
    // refresh token away, or there would be nothing left to retry with.
    expect(manager.removeUser).not.toHaveBeenCalled();

    online = true;
    await user().click(within(dialog).getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(areRequestsSuspended()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});

describe('nothing to preserve', () => {
  it('shows the standalone ended screen when a peer ends the session before any page rendered', async () => {
    // Boot never resolves, so this tab has rendered no protected content when
    // the peer's broadcast lands: there is no page worth overlaying.
    const manager = fakeUserManager({ signinSilent: vi.fn(() => new Promise(() => undefined)) });
    const { baseElement } = renderApp(signedInDeps({ manager }));
    await screen.findByRole('status');

    act(() => channels[1]!.post({ type: 'session-expired', reason: 'idle' }));

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/paused after inactivity/i);
    // It reads its words from the same source as the overlay, so the two
    // surfaces cannot tell different stories about the same reason.
    expect(screen.getByText(/there was no activity for 10 seconds/i)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // The context change was not user-initiated: the heading takes focus.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('states a server-confirmed expiry differently from an idle pause', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn(() => new Promise(() => undefined)) });
    renderApp(signedInDeps({ manager }));
    await screen.findByRole('status');

    act(() => channels[1]!.post({ type: 'session-expired' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/has expired/i);
    expect(screen.queryByText(/paused after inactivity/i)).not.toBeInTheDocument();
  });
});

describe('background tabs', () => {
  it('locks a hidden tab instead of keeping its session alive', async () => {
    renderApp(signedInDeps());
    await screen.findByRole('heading', { name: 'Dashboard' });

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      advance(POLICY.idleTimeoutMs);
      expect(await screen.findByRole('alertdialog')).toHaveTextContent(/paused after inactivity/i);
    } finally {
      visibility.mockRestore();
    }
  });
});
