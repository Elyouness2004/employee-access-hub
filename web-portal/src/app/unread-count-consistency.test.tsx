import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { env } from '@/config/env';
import { DashboardPage } from '@/features/dashboard';
import { NotificationBell } from '@/features/notifications';
import { unreadCountKey } from '@/shared/notifications';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

/**
 * The unread badge is ONE number.
 *
 * This test lives in `app/` because it composes two features, which only the
 * app layer may do (FRONTEND-ARCHITECTURE §14) — and composing them is exactly
 * what the landing route does: the bell sits in the header while the dashboard
 * tile sits in the page, both on screen at once.
 *
 * They used to be two hooks over one endpoint under two cache keys. That cost a
 * second request, and — because the notification mark-read mutations only ever
 * adjusted their own key — it left the tile showing the pre-mark-read number
 * while the bell showed the new one. The count query now lives in
 * `shared/notifications`; this asserts the property that fix exists for.
 */
const COUNT = `${env.apiBaseUrl}/api/hr/notifications/count`;

describe('unread notification count', () => {
  it('serves the dashboard tile and the bell from one request and one cache entry', async () => {
    let calls = 0;
    server.use(
      http.get(COUNT, () => {
        calls += 1;
        return HttpResponse.json({ unread: 3 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });

    renderWithProviders(
      <>
        <DashboardPage />
        <NotificationBell />
      </>,
      { queryClient },
    );

    // Both surfaces show it...
    await waitFor(() => expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2));
    // ...from one request...
    expect(calls).toBe(1);
    // ...and one cache entry, which is what keeps them from drifting apart.
    expect(queryClient.getQueryData(unreadCountKey)).toBe(3);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ predicate: (query) => query.queryKey.includes('count') }),
    ).toHaveLength(1);
  });
});
