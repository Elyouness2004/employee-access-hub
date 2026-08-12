import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { appRoutes } from '@/app/router/routes';
import { renderWithRouter } from '@/shared/testing/render';

describe('AppShell', () => {
  it('renders the landmarks: skip link first, primary nav, header, main with h1', async () => {
    const user = userEvent.setup();
    renderWithRouter(appRoutes);

    // Skip link is the first focusable element and targets #main.
    await user.tab();
    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main');

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(within(main).getByRole('heading', { level: 1, name: /welcome/i })).toBeInTheDocument();
  });

  it('marks the active route in the sidebar (aria-current)', async () => {
    renderWithRouter(appRoutes, { route: '/leave' });

    // /leave is code-split, so the shell resolves before the page does.
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Leave' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('navigates by keyboard: Enter on a sidebar link reaches the page', async () => {
    const user = userEvent.setup();
    renderWithRouter(appRoutes);

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    within(nav).getByRole('link', { name: 'Expenses' }).focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { level: 1, name: 'My expenses' })).toBeVisible();
  });

  it('collapses the sidebar to the icon rail and persists the preference', async () => {
    const user = userEvent.setup();
    renderWithRouter(appRoutes);

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(localStorage.getItem('eah:sidebarCollapsed')).toBe('true');
    // Labels collapse to accessible-only text; links stay reachable.
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('resolves every approved route to a real page — no placeholders remain', async () => {
    // P20 and P21 were the last two placeholders. Nothing in the sitemap now
    // renders a "scheduled for phase N" panel, and this asserts the absence:
    // a regression that reinstated one would fail here rather than ship.
    const { container } = renderWithRouter(appRoutes, { route: '/hr/leave', role: 'HR' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Leave administration' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/scheduled for implementation phase/i)).not.toBeInTheDocument();
    const { axe } = await import('vitest-axe');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations on the shell + home page', async () => {
    const { container } = renderWithRouter(appRoutes);
    await screen.findByRole('heading', { level: 1, name: /welcome/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
