import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { DevIdentityProvider } from '@/app/dev/DevIdentityProvider';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { appRoutes } from '@/app/router/routes';
import { TooltipProvider } from '@/shared/components/ui';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

/**
 * The full dev-identity wiring, exactly as App composes it: switching the
 * mocked role reshapes navigation and persists across reloads. No tokens are
 * ever created or stored.
 */
function renderWithDevIdentity() {
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] });
  return render(
    <ThemeProvider>
      <DevIdentityProvider>
        <QueryProvider>
          <TooltipProvider delayDuration={0}>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryProvider>
      </DevIdentityProvider>
    </ThemeProvider>,
  );
}

describe('development role switching', () => {
  it('starts as the configured default role with the DEV marker visible', async () => {
    renderWithDevIdentity();

    const switcher = await screen.findByRole('button', { name: /switch development role/i });
    expect(switcher).toHaveTextContent('DEV');
    expect(switcher).toHaveTextContent('EMPLOYEE');
  });

  it('reshapes navigation when switching to HR and persists the choice', async () => {
    const user = userEvent.setup();
    renderWithDevIdentity();

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: 'Employees' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /switch development role/i }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent(/not real authentication/i);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'HR' }));

    expect(await within(nav).findByRole('link', { name: 'Employees' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();

    expect(localStorage.getItem('eah:devRole')).toBe('"HR"');
    // No token anywhere — the dev identity is roles + labels only.
    expect(localStorage.getItem('eah:devRole')).not.toMatch(/token/i);
    expect(Object.keys(localStorage)).toEqual(['eah:devRole']);
  });

  it('reflects the switched identity in the user menu role chips', async () => {
    const user = userEvent.setup();
    renderWithDevIdentity();

    await user.click(await screen.findByRole('button', { name: /switch development role/i }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'ADMIN' }),
    );

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    const userMenu = await screen.findByRole('menu');
    expect(within(userMenu).getByText('dev.admin')).toBeInTheDocument();
    expect(within(userMenu).getByText('ADMIN')).toBeInTheDocument();
  });
});
