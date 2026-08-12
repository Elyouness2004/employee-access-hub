import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { appRoutes } from '@/app/router/routes';
import { renderWithRouter } from '@/shared/testing/render';

describe('/403 route (P02)', () => {
  it('renders the access-denied page inside the shell with a way home', () => {
    renderWithRouter(appRoutes, { route: '/403' });

    expect(screen.getByRole('heading', { level: 1, name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText(/server enforces access/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithRouter(appRoutes, { route: '/403' });
    await screen.findByRole('heading', { level: 1, name: 'Access denied' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
