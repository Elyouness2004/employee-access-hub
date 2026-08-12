import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appRoutes } from '@/app/router/routes';
import { renderWithRouter } from '@/shared/testing/render';

/**
 * Route guards over the REAL route tree, per verified composite role.
 * Guards are UX: the server authorizes every request — a guard denial routes
 * to /403 (authenticated but not permitted), never to login and never a 404.
 */

const MANAGER_ONLY = ['/approvals', '/team'];
const HR_ADMIN = [
  '/hr/employees',
  // The detail route is guarded by the same branch, and is reachable only by id.
  '/hr/employees/11111111-1111-1111-1111-111111111111',
  '/hr/departments',
  '/hr/positions',
  '/hr/leave',
  '/hr/expenses',
  '/hr/documents',
  '/hr/audit',
  '/analytics',
];
const ADMIN_ONLY = ['/admin/document-categories'];
const EVERY_ROLE = [
  '/leave',
  '/expenses',
  '/documents',
  '/notifications',
  '/account/profile',
  '/account/sessions',
];

describe('RouteGuard — authorized access', () => {
  it.each(EVERY_ROLE)('lets an EMPLOYEE open %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'EMPLOYEE', route: path });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Access denied');
  });

  it.each(MANAGER_ONLY)('lets a MANAGER open %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'MANAGER', route: path });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Access denied');
  });

  it.each(HR_ADMIN)('lets HR open %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'HR', route: path });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Access denied');
  });

  it.each([...HR_ADMIN, ...ADMIN_ONLY])('lets an ADMIN open %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'ADMIN', route: path });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Access denied');
  });
});

describe('RouteGuard — denials route to /403 naming the attempted path', () => {
  it.each(MANAGER_ONLY)('denies an EMPLOYEE at %s', async (path) => {
    const { router } = renderWithRouter(appRoutes, { role: 'EMPLOYEE', route: path });

    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/403');
    expect(screen.getByText(new RegExp(path))).toBeInTheDocument();
  });

  it.each(MANAGER_ONLY)('denies HR at the MANAGER-only route %s', async (path) => {
    // Team surfaces are MANAGER-only — HR/ADMIN receive 403 from the server.
    renderWithRouter(appRoutes, { role: 'HR', route: path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  });

  it.each(MANAGER_ONLY)('denies ADMIN at the MANAGER-only route %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'ADMIN', route: path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  });

  it.each(HR_ADMIN)('denies a MANAGER at %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'MANAGER', route: path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  });

  it.each(ADMIN_ONLY)('denies HR at the ADMIN-only route %s', async (path) => {
    renderWithRouter(appRoutes, { role: 'HR', route: path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  });
});

describe('403 semantics', () => {
  it('says the user IS authenticated but the policy denied the request', async () => {
    renderWithRouter(appRoutes, { role: 'EMPLOYEE', route: '/approvals' });

    const description = await screen.findByText(/you are signed in/i);
    expect(description).toHaveTextContent(/authorization policy denied/i);
    // Never implies a logged-out state.
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session (has )?expired/i)).not.toBeInTheDocument();
  });

  it('stays distinct from 404 (unknown route)', async () => {
    renderWithRouter(appRoutes, { role: 'EMPLOYEE', route: '/nope/not-a-route' });

    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Access denied');
  });
});
