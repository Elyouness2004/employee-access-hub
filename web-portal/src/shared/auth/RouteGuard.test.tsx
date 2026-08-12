import { screen } from '@testing-library/react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/shared/testing/render';

import { RouteGuard } from './RouteGuard';

/**
 * RouteGuard in isolation. Composite roles arrive pre-expanded from Keycloak,
 * so the guard does a flat membership check — no hierarchy logic client-side.
 * (Coverage over the real route tree lives in app/router/route-guards.test.tsx.)
 */

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Outlet />,
    children: [
      {
        element: <RouteGuard anyOf={['HR', 'ADMIN']} />,
        children: [{ path: 'restricted', element: <h1>Restricted area</h1> }],
      },
      { path: '403', element: <h1>Access denied</h1> },
    ],
  },
];

describe('RouteGuard', () => {
  it('renders the branch when the identity holds one of the required roles', async () => {
    renderWithRouter(routes, { role: 'HR', route: '/restricted' });
    expect(await screen.findByRole('heading', { name: 'Restricted area' })).toBeVisible();
  });

  it('accepts any of several required roles', async () => {
    renderWithRouter(routes, { role: 'ADMIN', route: '/restricted' });
    expect(await screen.findByRole('heading', { name: 'Restricted area' })).toBeVisible();
  });

  it('redirects to /403 when no required role is held', async () => {
    const { router } = renderWithRouter(routes, { role: 'EMPLOYEE', route: '/restricted' });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/403');
  });

  it('passes the attempted path to /403 and replaces history (no back-loop)', async () => {
    const { router } = renderWithRouter(routes, { role: 'MANAGER', route: '/restricted' });

    await screen.findByRole('heading', { name: 'Access denied' });
    expect(router.state.location.state).toEqual({ attemptedPath: '/restricted' });
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('does not treat a composite parent role as implying an unrelated role', async () => {
    // MANAGER expands to [MANAGER, EMPLOYEE] — never to HR or ADMIN.
    const { router } = renderWithRouter(routes, { role: 'MANAGER', route: '/restricted' });
    await screen.findByRole('heading', { name: 'Access denied' });
    expect(router.state.location.pathname).toBe('/403');
  });
});
