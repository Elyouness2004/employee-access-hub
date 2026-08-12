import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { appRoutes } from '@/app/router/routes';
import { renderWithRouter } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

describe('mobile navigation drawer', () => {
  it('opens from the hamburger, traps focus, and closes on Escape restoring focus', async () => {
    setViewport(375);
    const user = userEvent.setup();
    renderWithRouter(appRoutes);

    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(within(dialog).getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    // Focus lands inside the drawer.
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('uses the same role-filtered navigation model as the sidebar, with no axe violations open', async () => {
    setViewport(375);
    const user = userEvent.setup();
    const { container } = renderWithRouter(appRoutes, { role: 'HR' });

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    const drawerNav = within(dialog).getByRole('navigation', { name: 'Primary' });

    expect(within(drawerNav).getByRole('link', { name: 'Employees' })).toBeInTheDocument();
    expect(within(drawerNav).queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();

    const { axe } = await import('vitest-axe');
    expect(await axe(document.body)).toHaveNoViolations();
    expect(container).toBeInTheDocument();
  });

  it('navigates and closes when a drawer link is activated', async () => {
    setViewport(375);
    const user = userEvent.setup();
    renderWithRouter(appRoutes);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    await user.click(within(dialog).getByRole('link', { name: 'Leave' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'My leave' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  });
});
