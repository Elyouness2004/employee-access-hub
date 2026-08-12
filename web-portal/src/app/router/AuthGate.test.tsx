import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { UserManager } from 'oidc-client-ts';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/features/auth';
import { AuthGate } from '@/app/router/AuthGate';
import {
  FakeLockManager,
  fakeUser,
  fakeUserManager,
  linkedChannels,
} from '@/features/auth/test-support';

/**
 * The production branch of the gate. Every other route test runs with
 * VITE_DEV_AUTH=mock (identity provided above the router), so without this
 * file nothing exercises the path a real build takes:
 * AuthGate → RequireAuth → splash / login redirect / identity.
 */
vi.mock('@/config/env', async () => {
  const actual = await vi.importActual<typeof import('@/config/env')>('@/config/env');
  return { ...actual, useMockIdentity: false };
});

const routes: RouteObject[] = [
  { path: '/login', element: <h1>Sign in</h1> },
  { element: <AuthGate />, children: [{ path: '/', element: <h1>Dashboard</h1> }] },
];

function renderGate(manager: UserManager) {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        mode="oidc"
        deps={{
          manager,
          channel: linkedChannels(1)[0],
          locks: new FakeLockManager(),
          handoffTimeoutMs: 5,
        }}
      >
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('AuthGate (production identity path)', () => {
  it('gates protected routes behind authentication instead of passing through', () => {
    renderGate(fakeUserManager({ getUser: vi.fn(() => new Promise(() => undefined)) }));

    // Restoring: neither the protected page nor a login form may appear.
    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('sends an unauthenticated visitor to /login', async () => {
    const router = renderGate(fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(null) }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('renders the protected route once a session exists', async () => {
    renderGate(fakeUserManager({ signinSilent: vi.fn().mockResolvedValue(fakeUser()) }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
