import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { employeeProfileFixture } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { ProfilePage } from './pages/ProfilePage';

/**
 * P13 — Profile. Every state the page can be in, asserted as a DISTINCT render:
 * loading, data, unlinked (404), and failure.
 */

const ME = `${env.apiBaseUrl}/api/hr/me`;
const ACCESS = `${env.apiBaseUrl}/api/hr/auth/me`;

describe('profile — data', () => {
  it('shows the resolved HR record and the server’s view of the token', async () => {
    const { container } = renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('Amina Berrada')).toBeVisible();
    // Labels arrive RESOLVED because the catalogues behind them are HR-only.
    expect(screen.getByText('Engineering')).toBeVisible();
    expect(screen.getByText('Senior Engineer')).toBeVisible();
    expect(screen.getByText('Youssef Alami')).toBeVisible();
    expect(screen.getByText(employeeProfileFixture.matricule)).toBeVisible();

    // The two identifiers stay visibly distinct — confusing them is a bug.
    expect(screen.getByText('Employee id')).toBeVisible();
    expect(await screen.findByText('Subject (login account)')).toBeVisible();

    // Authorities come from the SERVER, not from the client's decoded token.
    expect(await screen.findByText('ROLE_EMPLOYEE')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a missing manager and unresolved catalogue entries honestly', async () => {
    server.use(
      http.get(
        ME,
        () =>
          new Response(
            JSON.stringify({
              ...employeeProfileFixture,
              departmentName: null,
              positionTitle: null,
              managerName: null,
              managerEmail: null,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('No manager on record')).toBeVisible();
    expect(screen.getAllByText('Not assigned')).toHaveLength(2);
  });
});

describe('profile — states', () => {
  it('shows a loading placeholder before anything resolves', () => {
    const { container } = renderWithProviders(<ProfilePage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('treats a 404 as "not linked yet", not as a failure', async () => {
    server.use(
      http.get(ME, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'no employee record' }),
      ),
    );

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText(/no employee record linked yet/i)).toBeVisible();
    // It is an empty state, so nothing shouts failure or offers a pointless retry.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows the server detail and correlation id when the record cannot be read', async () => {
    server.use(
      http.get(ME, () =>
        problemResponse(500, { title: 'Server error', detail: 'database unavailable' }, 'corr-500'),
      ),
    );

    renderWithProviders(<ProfilePage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/database unavailable/i);
    expect(alert).toHaveTextContent('corr-500');
  });

  it('renders the 403 detail inline rather than redirecting', async () => {
    server.use(
      http.get(ACCESS, () =>
        problemResponse(403, { detail: 'Access is denied by policy' }, 'corr-403'),
      ),
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('Access is denied by policy')).toBeVisible());
    expect(screen.getByText(/you are signed in/i)).toBeVisible();
  });
});
