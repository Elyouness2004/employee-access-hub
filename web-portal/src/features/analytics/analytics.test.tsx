import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { analyticsDashboardFixture, analyticsDegradedFixture } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { AnalyticsPage } from './pages/AnalyticsPage';

/**
 * P24 — Analytics.
 *
 * One contract dominates this page and most of these tests: `available: false`
 * arrives WITH zeros (every `*Summary.unavailable()` factory fills the counts
 * with 0), so the page must branch on the flag before it reads a figure. A test
 * that only checked "the unavailable panel appears" would pass while the zeros
 * were also on screen — so the assertions check for the absence of the numbers
 * too.
 */

const ANALYTICS = `${env.apiBaseUrl}/api/analytics/dashboard`;

describe('analytics dashboard (P24)', () => {
  it('renders every section with its figures and the freshness stamp', async () => {
    const { container } = renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText('137')).toBeVisible(); // total employees
    expect(screen.getByText('276')).toBeVisible(); // leave total
    expect(screen.getByText('412')).toBeVisible(); // documents total
    expect(screen.getByText(/these are cached snapshots, not live counts/i)).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders an unavailable section as unavailable — and shows none of its zeros', async () => {
    server.use(http.get(ANALYTICS, () => HttpResponse.json(analyticsDegradedFixture)));

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText('Leave KPIs unavailable')).toBeVisible();
    expect(screen.getByText('Expense KPIs unavailable')).toBeVisible();
    expect(
      screen.getAllByText(/is unreachable, so these figures could not be collected/i).length,
    ).toBe(2);

    // The payload carried zeros for both sections; not one of them is on screen.
    expect(screen.queryByText('Requests recorded')).toBeNull();
    expect(screen.queryByText('Claims recorded')).toBeNull();
    expect(screen.queryByText('Awaiting a decision')).toBeNull();
  });

  it('keeps the sections that answered when another source is unreachable', async () => {
    server.use(http.get(ANALYTICS, () => HttpResponse.json(analyticsDegradedFixture)));

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    // Employees and documents are still available in the degraded fixture.
    expect(await screen.findByText('137')).toBeVisible();
    expect(screen.getByText('412')).toBeVisible();
  });

  it('renders a measured zero as a number — a real zero is information', async () => {
    server.use(
      http.get(ANALYTICS, () =>
        HttpResponse.json({
          ...analyticsDashboardFixture,
          leave: {
            available: true,
            submitted: 0,
            approved: 0,
            rejected: 0,
            cancelled: 0,
            total: 0,
          },
        }),
      ),
    );

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText('Requests recorded')).toBeVisible();
    expect(screen.queryByText('Leave KPIs unavailable')).toBeNull();
  });

  it('never folds pending-second-approval into approved', async () => {
    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    const label = await screen.findByText('Awaiting second approval');
    // The card is the StatCard panel: label wrapper → panel.
    const card = label.closest('div')!.parentElement!;
    // 3 pending-second-approval, kept apart from the 191 approved.
    expect(await within(card).findByText('3')).toBeVisible();
    expect(within(card).getByText(/waiting on HR/i)).toBeVisible();
    // Also present, separately, in the approved figure and the status donut.
    expect(screen.getAllByText('191').length).toBeGreaterThan(0);
  });

  it('says so rather than guessing when the approved amount has no currency', async () => {
    server.use(
      http.get(ANALYTICS, () =>
        HttpResponse.json({
          ...analyticsDashboardFixture,
          expenses: { ...analyticsDashboardFixture.expenses, currency: null },
        }),
      ),
    );

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText(/currency not reported/i)).toBeVisible();
  });

  it('draws the status donut with an accessible table carrying the same numbers', async () => {
    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    const table = await screen.findByRole('table', { name: /leave requests by status/i });
    expect(within(table).getByRole('rowheader', { name: 'Approved' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '240' })).toBeVisible();
    // The visible legend repeats it, so nothing depends on telling colours apart.
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(1);
  });

  it('refetches on demand and reports the new stamp', async () => {
    let calls = 0;
    server.use(
      http.get(ANALYTICS, () => {
        calls += 1;
        return HttpResponse.json(analyticsDashboardFixture);
      }),
    );

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });
    await screen.findByText('137');

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(calls).toBe(2));
  });

  it('renders a 403 inline with the server’s wording, not a redirect', async () => {
    server.use(
      http.get(ANALYTICS, () =>
        problemResponse(403, { detail: 'Access Denied' }, 'corr-analytics-403'),
      ),
    );

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText('Access Denied')).toBeVisible();
    expect(screen.getByText('corr-analytics-403', { exact: false })).toBeVisible();
  });

  it('separates a failed request from an unavailable source', async () => {
    server.use(
      http.get(ANALYTICS, () =>
        problemResponse(503, {
          title: 'Service unavailable',
          detail: 'analytics-service is not answering',
        }),
      ),
    );

    renderWithProviders(<AnalyticsPage />, { role: 'HR' });

    expect(await screen.findByText(/analytics-service is not answering/i)).toBeVisible();
    expect(screen.getByText(/try again shortly/i)).toBeVisible();
    // The "Data unavailable" panel is for a section that reported itself
    // absent — a failed request is a different fact, and the sentence that
    // belongs only to the unavailable panel must not appear.
    expect(
      screen.queryByText(/is unreachable, so these figures could not be collected/i),
    ).toBeNull();
  });
});
