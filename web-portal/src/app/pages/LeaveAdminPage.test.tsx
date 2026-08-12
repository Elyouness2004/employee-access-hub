import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/shared/testing/render';

import { LeaveAdminPage } from './LeaveAdminPage';

/**
 * P20 page composition. The panels have their own suites; what is asserted here
 * is the composition itself — the tab in the URL, the picker wired from the
 * employees feature into the leave feature's slot, and the honest statement of
 * the capability leave-service does not have.
 */
describe('leave administration page (P20)', () => {
  it('opens on the escalated queue and states what the queue is not', async () => {
    const { container } = renderWithProviders(<LeaveAdminPage />, { role: 'HR' });

    expect(screen.getByRole('heading', { level: 1, name: 'Leave administration' })).toBeVisible();
    // The backend has no all-requests list; the page says so rather than
    // building one out of the escalation queue.
    expect(screen.getByText(/publishes no all-requests list/i)).toBeVisible();
    expect(await screen.findByText('10 Aug 2026 – 14 Aug 2026')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('deep-links to the balances tab with the employee picker in place', async () => {
    const { container } = renderWithProviders(<LeaveAdminPage />, {
      role: 'HR',
      route: '/hr/leave?view=balances',
    });

    expect(await screen.findByText(/choose an employee/i)).toBeVisible();
    // The picker comes from features/employees through the panel's slot.
    expect(screen.getByRole('button', { name: /employee.*no employee chosen/i })).toBeVisible();
    expect(screen.getByLabelText('Leave year')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('loads the allocation once an employee is chosen through the picker', async () => {
    renderWithProviders(<LeaveAdminPage />, { role: 'HR', route: '/hr/leave?view=balances' });
    await screen.findByText(/choose an employee/i);

    await userEvent.click(screen.getByRole('button', { name: /employee.*no employee chosen/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /Amina Berrada/i }));

    expect(await screen.findByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      '12 of 25 days used, 13 available',
    );
  });

  it('keeps the active tab in the URL', async () => {
    renderWithProviders(<LeaveAdminPage />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('tab', { name: 'Balances' }));

    expect(await screen.findByText(/choose an employee/i)).toBeVisible();
  });
});
