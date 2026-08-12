import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { sessionsFixture } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { SessionsPage } from './pages/SessionsPage';

const SESSIONS = `${env.apiBaseUrl}/api/hr/sessions`;
const TERMINATE = `${env.apiBaseUrl}/api/hr/sessions/:id`;

describe('my sessions (P11)', () => {
  it('lists every session, marks the current one, and states the MFA fact', async () => {
    const { container } = renderWithProviders(<SessionsPage />);

    expect(await screen.findByText('Firefox on Ubuntu')).toBeVisible();
    expect(screen.getByText('This device')).toBeVisible();
    // MFA is not implemented in the realm (backend P3.5) — false is the truth,
    // and the UI says so rather than hiding the field.
    expect(screen.getAllByText('No MFA on this session')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not invent device metadata the backend returned as null', async () => {
    renderWithProviders(<SessionsPage />);
    await screen.findByText('Firefox on Ubuntu');

    // The second fixture has no browser, OS or device name at all.
    expect(screen.getByText('Unknown device')).toBeVisible();
    expect(screen.getByText('None recorded')).toBeVisible();
  });

  it('is never empty — the request itself proves a session exists', async () => {
    renderWithProviders(<SessionsPage />);
    await screen.findByText('Firefox on Ubuntu');
    expect(screen.queryByText(/no sessions/i)).not.toBeInTheDocument();
  });

  it('names the consequence before ending another device’s session', async () => {
    renderWithProviders(<SessionsPage />);
    await screen.findByText('Unknown device');

    await userEvent.click(screen.getAllByRole('button', { name: 'End session' })[0]!);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/unknown device will be signed out/i);
    expect(dialog).toHaveTextContent(/must sign in again/i);
  });

  it('shows the loading placeholder, then the list', async () => {
    const { container } = renderWithProviders(<SessionsPage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    await screen.findByText('Firefox on Ubuntu');
  });

  it('surfaces a failure with the server detail and a retry', async () => {
    server.use(
      http.get(SESSIONS, () =>
        problemResponse(503, {
          title: 'Identity provider unavailable',
          detail: 'Keycloak is down',
        }),
      ),
    );

    renderWithProviders(<SessionsPage />);

    expect(await screen.findByText(/keycloak is down/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });
});

describe('terminating the current session (confirmCurrent flow)', () => {
  it('asks again — and only then sends confirmCurrent=true', async () => {
    const requests: URL[] = [];
    server.use(
      http.delete(TERMINATE, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        // The server refuses the first attempt: this is a guard, not an error.
        if (url.searchParams.get('confirmCurrent') !== 'true') {
          return problemResponse(409, {
            title: 'Confirmation required',
            detail: 'terminating the current session requires confirmCurrent=true',
          });
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const signOut = vi.fn();
    renderWithProviders(<SessionsPage />, { sessionControls: { signOut } });
    await screen.findByText('Firefox on Ubuntu');

    await userEvent.click(screen.getByRole('button', { name: 'End this session' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /end session/i }));

    // Round two: the dialog now names the real consequence.
    await waitFor(() =>
      expect(screen.getByRole('alertdialog')).toHaveTextContent(/end the session you are using\?/i),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/signed out of this tab/i);
    expect(requests[0]?.searchParams.get('confirmCurrent')).toBeNull();

    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /end my session and sign out/i,
      }),
    );

    await waitFor(() => expect(requests[1]?.searchParams.get('confirmCurrent')).toBe('true'));
    // Tokens in this tab are worthless now — the app signs out rather than
    // leaving a page that looks signed in.
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it('reports how many other sessions were ended', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/hr/sessions/logout-others`, () =>
        HttpResponse.json({ terminated: 3 }),
      ),
    );

    renderWithProviders(<SessionsPage />);
    await screen.findByText('Firefox on Ubuntu');

    await userEvent.click(screen.getByRole('button', { name: /sign out other sessions/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /sign out other sessions/i }));

    expect(await screen.findByText(/3 other sessions ended/i)).toBeVisible();
  });

  it('hides the bulk action when there is nothing else to end', async () => {
    server.use(http.get(SESSIONS, () => HttpResponse.json([sessionsFixture[0]])));

    renderWithProviders(<SessionsPage />);
    await screen.findByText('Firefox on Ubuntu');

    // Hidden, not disabled — a disabled control needs a reason.
    expect(screen.queryByRole('button', { name: /sign out other sessions/i })).toBeNull();
  });
});
