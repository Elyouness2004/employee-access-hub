import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UserMenu } from '@/shared/components/UserMenu';
import { renderWithProviders } from '@/shared/testing/render';

describe('UserMenu', () => {
  it('shows the actor: name, mono username, and role chips from the identity', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu />, { role: 'MANAGER' });

    await user.click(screen.getByRole('button', { name: /user menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('test.manager')).toBeInTheDocument();
    expect(within(menu).getByText('MANAGER')).toBeInTheDocument();
    expect(within(menu).getByText('EMPLOYEE')).toBeInTheDocument();
  });

  it('links to Profile and Sessions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu />);

    await user.click(screen.getByRole('button', { name: /user menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /sessions/i })).toBeInTheDocument();
  });

  it('signs out through the session controls (real authentication)', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    renderWithProviders(<UserMenu />, { sessionControls: { signOut } });

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    const item = await screen.findByRole('menuitem', { name: /sign out/i });
    expect(item).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(item);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('disables Sign out WITH its stated reason when no real session exists (dev mock)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu />, { sessionControls: null });

    await user.click(screen.getByRole('button', { name: /user menu/i }));

    const signOut = await screen.findByRole('menuitem', { name: /sign out/i });
    expect(signOut).toHaveAttribute('aria-disabled', 'true');
    expect(signOut).toHaveTextContent(/development mock identity/i);
  });

  it('toggles the theme and stamps data-theme on <html>', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu />);

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /switch to dark theme/i }));

    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /switch to light theme/i }));

    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
