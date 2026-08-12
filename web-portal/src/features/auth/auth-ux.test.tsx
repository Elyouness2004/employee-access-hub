import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorResponse } from 'oidc-client-ts';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { resetSessionRenewer } from '@/shared/api';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

import { AuthProvider, type AuthProviderDeps } from './AuthProvider';
import { RequireAuth } from './guards/RequireAuth';
import { CallbackPage } from './pages/CallbackPage';
import { LoginPage } from './pages/LoginPage';
import { FakeLockManager, fakeUser, fakeUserManager, linkedChannels } from './test-support';

/**
 * The user-visible authentication states, each a DISTINCT render:
 * bootstrap loading, login entry, session expired, sign-out, callback failure.
 * No protected content may appear before the session state is known.
 */

function ProtectedPage() {
  return (
    <main>
      <h1>Dashboard</h1>
    </main>
  );
}

function renderAuthRoutes(deps: AuthProviderDeps, initialPath: string) {
  const routes: RouteObject[] = [
    { path: '/login', element: <LoginPage /> },
    { path: '/auth/callback', element: <CallbackPage /> },
    { element: <RequireAuth />, children: [{ path: '/', element: <ProtectedPage /> }] },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    router,
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider mode="oidc" deps={deps}>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  };
}

let channels: ReturnType<typeof linkedChannels>;
let locks: FakeLockManager;

beforeEach(() => {
  resetSessionRenewer();
  channels = linkedChannels(2);
  locks = new FakeLockManager();
  window.history.pushState({}, '', '/');
});

describe('bootstrap loading state', () => {
  it('shows an accessible restoring state — never the protected shell', () => {
    const manager = fakeUserManager({ getUser: vi.fn(() => new Promise(() => undefined)) });
    renderAuthRoutes({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, '/');

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('renders the protected page once the session is restored', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    renderAuthRoutes({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, '/');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('offers organization sign-in and never collects a password', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'login_required' })),
    });
    const { container } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/login',
    );

    const button = await screen.findByRole('button', {
      name: /sign in with your organization account/i,
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Employee Access Hub' })).toBeVisible();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('form')).toBeNull();

    await userEvent.click(button);
    expect(manager.signinRedirect).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /redirecting/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('redirects an unauthenticated visit to /login carrying the intended route', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'login_required' })),
    });
    const { router } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/',
    );

    await screen.findByRole('button', { name: /sign in with your organization account/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toMatchObject({ returnTo: '/' });
  });

  it('states sign-out plainly — distinct from an expired session', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    const { router } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/',
    );
    await screen.findByRole('heading', { name: 'Dashboard' });

    channels[1]!.post({ type: 'signed-out' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText(/you have signed out/i)).toBeInTheDocument();
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('surfaces a sign-in start failure without protocol detail', async () => {
    const manager = fakeUserManager({
      signinSilent: vi.fn().mockRejectedValue(new ErrorResponse({ error: 'login_required' })),
      signinRedirect: vi.fn().mockRejectedValue(new Error('network down: https://kc/internals')),
    });
    renderAuthRoutes({ manager, channel: channels[0], locks, handoffTimeoutMs: 5 }, '/login');

    await userEvent.click(
      await screen.findByRole('button', { name: /sign in with your organization account/i }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be reached/i);
    expect(alert).not.toHaveTextContent(/kc\/internals/);
  });
});

describe('session expiration', () => {
  it('overlays the expired state on the STILL-MOUNTED page and offers re-authentication', async () => {
    const manager = fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) });
    const { baseElement } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/',
    );
    await screen.findByRole('heading', { name: 'Dashboard' });

    channels[1]!.post({ type: 'session-expired' });

    const dialog = await screen.findByRole('alertdialog', { name: /your session has expired/i });
    expect(dialog).toBeInTheDocument();
    // The page underneath is preserved — expiry no longer destroys the user's
    // work; it is covered (and aria-hidden), not unmounted.
    expect(screen.getByRole('heading', { name: 'Dashboard', hidden: true })).toBeInTheDocument();
    // Distinct from sign-out and from a permission denial.
    expect(screen.queryByText(/you have signed out/i)).not.toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();

    await userEvent.click(within(dialog).getByRole('button', { name: /sign in again/i }));
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/' } });
  });
});

describe('callback route', () => {
  it('shows a completion state, then lands on the returned route', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const manager = fakeUserManager({
      signinRedirectCallback: vi.fn().mockResolvedValue(fakeUser({ state: { returnTo: '/' } })),
    });
    const { router } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/auth/callback',
    );

    expect(screen.getByRole('status')).toHaveTextContent(/completing sign-in/i);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows a user-safe failure with a way back — never the protocol error', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const manager = fakeUserManager({
      signinRedirectCallback: vi
        .fn()
        .mockRejectedValue(new Error('No matching state found in storage')),
    });
    const { container, router } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/auth/callback',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid or has expired/i);
    expect(alert).not.toHaveTextContent(/matching state/i);
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: /return to sign-in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('completes the exchange exactly once', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const signinRedirectCallback = vi
      .fn()
      .mockResolvedValue(fakeUser({ state: { returnTo: '/' } }));
    renderAuthRoutes(
      { manager: fakeUserManager({ signinRedirectCallback }), channel: channels[0], locks },
      '/auth/callback',
    );

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(signinRedirectCallback).toHaveBeenCalledTimes(1);
  });

  it('sends an unsafe return path to home instead of following it', async () => {
    window.history.pushState({}, '', '/auth/callback');
    const manager = fakeUserManager({
      signinRedirectCallback: vi
        .fn()
        .mockResolvedValue(fakeUser({ state: { returnTo: 'https://evil.example/harvest' } })),
    });
    const { router } = renderAuthRoutes(
      { manager, channel: channels[0], locks, handoffTimeoutMs: 5 },
      '/auth/callback',
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.pathname + router.state.location.search).not.toContain('evil');
  });
});
