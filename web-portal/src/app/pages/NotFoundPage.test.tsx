import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { appRoutes } from '@/app/router/routes';
import { renderWithRouter } from '@/shared/testing/render';

describe('not-found route', () => {
  it('renders the 404 page inside the shell for unknown paths', () => {
    renderWithRouter(appRoutes, { route: '/no-such-page' });

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the Dashboard' })).toHaveAttribute('href', '/');
    // The shell survives: navigation still present.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithRouter(appRoutes, { route: '/no-such-page' });
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
