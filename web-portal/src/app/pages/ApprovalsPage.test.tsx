import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithRouter } from '@/shared/testing/render';

import { appRoutes } from '../router/routes';

/**
 * P14 — Approvals. Two queues on one page, and the role boundary around it.
 *
 * `/api/leave/requests/inbox` and `/api/expenses/pending` are both annotated
 * `hasRole('MANAGER')`, so HR and Admin users WITHOUT that role are denied by
 * the server. The route guard mirrors that exactly — the page must not be
 * offered to an administrator just because they administrate other domains.
 */
describe('approvals page', () => {
  it('shows both queues to a manager and switches between them by keyboard', async () => {
    const { container } = renderWithRouter(appRoutes, { role: 'MANAGER', route: '/approvals' });

    const tabs = await screen.findByRole('tablist', { name: /approval queues/i });
    expect(within(tabs).getByRole('tab', { name: /^leave/i })).toBeVisible();
    expect(within(tabs).getByRole('tab', { name: /^expenses/i })).toBeVisible();

    // The leave queue is the default panel.
    expect(await screen.findByRole('table', { name: /leave requests awaiting/i })).toBeVisible();

    // Radix gives arrow-key switching; this proves the wrapper kept it.
    await userEvent.click(within(tabs).getByRole('tab', { name: /^leave/i }));
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('table', { name: /expense claims awaiting/i })).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows how much is waiting on each tab, from the queue that fetched it', async () => {
    renderWithRouter(appRoutes, { role: 'MANAGER', route: '/approvals' });

    expect(await screen.findByRole('tab', { name: /^leave \(1\)/i })).toBeVisible();
  });

  it('keeps the open queue in the URL so it survives a reload or a shared link', async () => {
    const { router } = renderWithRouter(appRoutes, {
      role: 'MANAGER',
      route: '/approvals?queue=expenses',
    });

    expect(await screen.findByRole('table', { name: /expense claims awaiting/i })).toBeVisible();

    await userEvent.click(screen.getByRole('tab', { name: /^leave/i }));
    expect(router.state.location.search).toContain('queue=leave');
  });

  it.each(['EMPLOYEE', 'HR', 'ADMIN'] as const)(
    'denies %s — the endpoints are MANAGER-only, and the guard says the same',
    async (role) => {
      const { router } = renderWithRouter(appRoutes, { role, route: '/approvals' });

      expect(await screen.findByRole('heading', { name: /access denied/i })).toBeVisible();
      expect(router.state.location.pathname).toBe('/403');
    },
  );

  it('does not offer approvals in the navigation to a non-manager', async () => {
    renderWithRouter(appRoutes, { role: 'HR', route: '/' });

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    // Hidden, never disabled (DESIGN-SYSTEM §9.3).
    expect(within(nav).queryByRole('link', { name: 'Approvals' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'My team' })).toBeNull();
  });
});
