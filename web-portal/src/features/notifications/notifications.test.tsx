import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  pageOf,
  readNotificationFixture,
  unreadNotificationFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { NotificationBell } from './components/NotificationBell';
import { NotificationsPage } from './pages/NotificationsPage';

/**
 * P12 — Notification Center and the top-bar bell.
 *
 * The contract facts under test: history is paged with page+size only, `/unread`
 * is a separate unpaged endpoint rather than a filter, copy is rendered exactly
 * as the backend wrote it, read-state is the one optimistic mutation, and an
 * unknown unread count is never shown as zero.
 */

const NOTIFICATIONS = `${env.apiBaseUrl}/api/hr/notifications`;

describe('notification center (P12)', () => {
  it('renders the history with the backend’s own copy and its event code', async () => {
    const { container } = renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText('Account unlocked')).toBeVisible();
    // Verbatim from NotificationType — never re-worded client-side.
    expect(screen.getByText('Your account has been unlocked.')).toBeVisible();
    expect(screen.getByText('ACCOUNT_UNLOCKED')).toBeVisible();
    expect(screen.getByText('Security')).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('marks unread with text as well as a dot, never colour alone', async () => {
    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account unlocked');

    const list = screen.getByRole('list', { name: /all notifications/i });
    // The unread fixture carries the marker; the read one does not.
    expect(within(list).getAllByText('Unread')).toHaveLength(1);
  });

  it('sends page and size only — the endpoint accepts no sort, search or filter', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(NOTIFICATIONS, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([unreadNotificationFixture], { totalElements: 45 }));
      }),
    );

    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account unlocked');

    const params = requests[0]?.searchParams;
    expect(params?.get('page')).toBe('0');
    expect(params?.get('size')).toBe('20');
    expect(params?.get('sort')).toBeNull();
    expect(params?.get('search')).toBeNull();

    // And no affordance claims otherwise.
    expect(screen.queryByLabelText(/search/i)).toBeNull();
    expect(screen.queryByLabelText(/category/i)).toBeNull();
    expect(screen.getByText(/showing 1–1 of 45 notifications/i)).toBeVisible();
  });

  it('switches to the separate unpaged /unread endpoint, and says it is unpaged', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${NOTIFICATIONS}/unread`, ({ request }) => {
        calls.push(request.url);
        return HttpResponse.json([unreadNotificationFixture]);
      }),
    );

    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account unlocked');

    await userEvent.click(screen.getByRole('tab', { name: /unread/i }));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(new URL(calls[0]!).searchParams.get('page')).toBeNull();
    expect(await screen.findByText(/the unread feed is not paged/i)).toBeVisible();
  });

  it('marks one read optimistically and then reconciles with the server', async () => {
    // The server state really changes, so the refetch that follows the mutation
    // agrees with the optimistic update instead of undoing it.
    let read = false;
    server.use(
      http.get(NOTIFICATIONS, () =>
        HttpResponse.json(
          pageOf([
            read
              ? {
                  ...unreadNotificationFixture,
                  read: true,
                  status: 'READ',
                  readAt: '2026-08-01T09:00:00Z',
                }
              : unreadNotificationFixture,
          ]),
        ),
      ),
      http.get(`${NOTIFICATIONS}/count`, () => HttpResponse.json({ unread: read ? 0 : 1 })),
      http.patch(`${NOTIFICATIONS}/:id/read`, () => {
        read = true;
        return HttpResponse.json({ ...unreadNotificationFixture, read: true, status: 'READ' });
      }),
    );

    renderWithProviders(<NotificationsPage />);
    const markRead = await screen.findByRole('button', { name: /mark read/i });

    await userEvent.click(markRead);

    await waitFor(() => expect(screen.queryByRole('button', { name: /mark read/i })).toBeNull());
    // Still listed — marking read hides the action, not the notification.
    expect(screen.getByText('Account unlocked')).toBeVisible();
  });

  it('rolls the optimistic read back when the server refuses', async () => {
    server.use(
      http.patch(`${NOTIFICATIONS}/:id/read`, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'notification not found' }),
      ),
    );

    renderWithProviders(<NotificationsPage />);
    const markRead = await screen.findByRole('button', { name: /mark read/i });

    await userEvent.click(markRead);

    // The row comes back unread: a rejected mutation must not leave the UI
    // claiming something happened.
    expect(await screen.findByRole('button', { name: /mark read/i })).toBeVisible();
  });

  it('reports how many rows the server actually marked, not an assumption', async () => {
    server.use(http.patch(`${NOTIFICATIONS}/read-all`, () => HttpResponse.json({ markedRead: 7 })));

    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account unlocked');

    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }));

    expect(await screen.findByText(/marked 7 notifications as read/i)).toBeVisible();
  });

  it('says plainly when a mark-all changed nothing', async () => {
    server.use(http.patch(`${NOTIFICATIONS}/read-all`, () => HttpResponse.json({ markedRead: 0 })));

    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account unlocked');

    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }));

    expect(await screen.findByText(/nothing to mark/i)).toBeVisible();
  });

  it('explains an empty history as expected behaviour with the broker off', async () => {
    server.use(http.get(NOTIFICATIONS, () => HttpResponse.json(pageOf([]))));

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText(/no notifications yet/i)).toBeVisible();
    expect(screen.getByText(/with the event broker off/i)).toBeVisible();
  });

  it('distinguishes "nothing unread" from "no notifications at all"', async () => {
    server.use(
      http.get(NOTIFICATIONS, () => HttpResponse.json(pageOf([readNotificationFixture]))),
      http.get(`${NOTIFICATIONS}/unread`, () => HttpResponse.json([])),
    );

    renderWithProviders(<NotificationsPage />);
    await screen.findByText('Account provisioned');

    await userEvent.click(screen.getByRole('tab', { name: /unread/i }));

    expect(await screen.findByText(/nothing unread/i)).toBeVisible();
    expect(screen.queryByText(/no notifications yet/i)).toBeNull();
  });

  it('renders a failed history with the server detail and a retry', async () => {
    server.use(
      http.get(NOTIFICATIONS, () =>
        problemResponse(500, { detail: 'hr-service is unhappy' }, 'corr-notif-500'),
      ),
    );

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/hr-service is unhappy/i);
    expect(screen.getByText('corr-notif-500', { exact: false })).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  it('reads a 503 as a dependency to wait for, not as a failed request', async () => {
    server.use(
      http.get(NOTIFICATIONS, () =>
        problemResponse(503, { title: 'Service unavailable', detail: 'the database is down' }),
      ),
    );

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText(/the database is down/i)).toBeVisible();
    expect(screen.getByText(/try again shortly/i)).toBeVisible();
  });
});

describe('notification bell', () => {
  it('shows the unread count and names it accessibly', async () => {
    server.use(http.get(`${NOTIFICATIONS}/count`, () => HttpResponse.json({ unread: 3 })));

    renderWithProviders(<NotificationBell />);

    expect(await screen.findByRole('link', { name: /3 unread/i })).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
  });

  it('shows no number — never a zero — when the count cannot be read', async () => {
    server.use(
      http.get(`${NOTIFICATIONS}/count`, () => problemResponse(503, { detail: 'hr-service down' })),
    );

    renderWithProviders(<NotificationBell />);

    const link = await screen.findByRole('link', { name: /unread count unavailable/i });
    // A failed count must not render as "nothing waiting".
    expect(link).not.toHaveTextContent('0');
  });

  it('says "nothing unread" for a genuine zero', async () => {
    server.use(http.get(`${NOTIFICATIONS}/count`, () => HttpResponse.json({ unread: 0 })));

    renderWithProviders(<NotificationBell />);

    expect(await screen.findByRole('link', { name: /nothing unread/i })).toBeVisible();
  });

  it('caps the displayed pill but keeps the real figure in the accessible name', async () => {
    server.use(http.get(`${NOTIFICATIONS}/count`, () => HttpResponse.json({ unread: 128 })));

    renderWithProviders(<NotificationBell />);

    expect(await screen.findByRole('link', { name: /128 unread/i })).toBeVisible();
    expect(screen.getByText('99+')).toBeVisible();
  });

  it('polls the count every 60s and never in a background tab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(`${NOTIFICATIONS}/count`, () => {
        calls += 1;
        return HttpResponse.json({ unread: calls });
      }),
    );

    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(calls).toBe(1));

    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => expect(calls).toBe(2));

    vi.useRealTimers();
  });
});
