import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/app/layouts/AppShell';
import { RouteErrorBoundary } from '@/app/router/RouteErrorBoundary';
import { renderWithRouter } from '@/shared/testing/render';

function Boom(): never {
  throw new Error('exploded during render');
}

const crashingRoutes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        errorElement: <RouteErrorBoundary />,
        children: [{ index: true, element: <Boom /> }],
      },
    ],
  },
];

describe('RouteErrorBoundary', () => {
  beforeAll(() => {
    // React logs the caught render error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('keeps the shell alive and shows a user-safe message with a reload action', () => {
    renderWithRouter(crashingRoutes);

    // The failing page did not blank the app: navigation is still there.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/unexpected error/i);
    expect(alert).not.toHaveTextContent('exploded during render');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });

  it('separates development diagnostics from the user-facing text', () => {
    renderWithRouter(crashingRoutes);

    // In dev/test builds the stack is available, but only behind a
    // deliberately-opened disclosure — never in the primary message.
    const disclosure = screen.getByText('Development diagnostics');
    expect(disclosure.closest('details')).not.toBeNull();
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
  });
});
