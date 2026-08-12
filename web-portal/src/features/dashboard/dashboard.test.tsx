import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  analyticsDashboardFixture,
  auditStatisticsFixture,
  leaveRequestFixture,
  pageOf,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { DashboardPage } from './pages/DashboardPage';

const BALANCE = `${env.apiBaseUrl}/api/leave/balances/my`;
const MY_LEAVE = `${env.apiBaseUrl}/api/leave/requests/my`;
const MY_EXPENSES = `${env.apiBaseUrl}/api/expenses/my`;
const INBOX = `${env.apiBaseUrl}/api/leave/requests/inbox`;

describe('dashboard (P04) — employee tier', () => {
  it('shows only figures with a real endpoint behind them', async () => {
    const { container } = renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('13')).toBeVisible();
    expect(screen.getByText(/of 25 allocated for 2026/i)).toBeVisible();
    // Every card states the question it answers, not just a number.
    expect(screen.getByText('Leave days available')).toBeVisible();
    expect(screen.getByText('Unread notifications')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('counts SUBMITTED and PENDING_SECOND_APPROVAL separately, never summed', async () => {
    const statuses: (string | null)[] = [];
    server.use(
      http.get(MY_EXPENSES, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        statuses.push(status);
        return HttpResponse.json(pageOf([], { totalElements: status === 'SUBMITTED' ? 2 : 1 }));
      }),
    );

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Expenses awaiting a decision')).toBeVisible();
    expect(screen.getByText('Expenses awaiting HR sign-off')).toBeVisible();
    await waitFor(() => expect(statuses).toContain('SUBMITTED'));
    expect(statuses).toContain('PENDING_SECOND_APPROVAL');
  });

  it('counts without downloading a list', async () => {
    const sizes: (string | null)[] = [];
    server.use(
      http.get(MY_LEAVE, ({ request }) => {
        sizes.push(new URL(request.url).searchParams.get('size'));
        return HttpResponse.json(pageOf([], { totalElements: 7, size: 1 }));
      }),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(sizes[0]).toBe('1'));
    expect(await screen.findByText('7')).toBeVisible();
  });

  it('reports a failure by kind, with the server’s words — never as a zero', async () => {
    server.use(
      http.get(MY_LEAVE, () =>
        problemResponse(
          503,
          { title: 'Leave service unavailable', detail: 'leave service down' },
          'corr-503',
        ),
      ),
    );

    renderWithProviders(<DashboardPage />);

    // 503 is "wait for a dependency", not "something went wrong" and not 0.
    expect(await screen.findByText(/leave service down/i)).toBeVisible();
    expect(screen.getByText(/dependency being unreachable/i)).toBeVisible();
    expect(screen.getByText(/corr-503/)).toBeVisible();
  });

  it('shows a 403 with the server’s wording rather than a generic failure', async () => {
    server.use(
      http.get(MY_LEAVE, () => problemResponse(403, { detail: 'Access Denied' }, 'corr-403')),
    );

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Access Denied')).toBeVisible();
    expect(screen.getByText(/you are signed in/i)).toBeVisible();
  });

  it('renders a genuine zero as a zero — that is information, not an absence', async () => {
    server.use(http.get(MY_LEAVE, () => HttpResponse.json(pageOf([], { totalElements: 0 }))));

    renderWithProviders(<DashboardPage />);

    await screen.findByText('Leave awaiting a decision');
    await waitFor(() => expect(screen.getAllByText('0').length).toBeGreaterThan(0));
    expect(screen.queryByText(/data unavailable/i)).not.toBeInTheDocument();
  });

  it('explains an unlinked HR record instead of showing broken figures', async () => {
    server.use(
      http.get(BALANCE, () =>
        // leave-service answers 422 `Employee not eligible`, never 404.
        problemResponse(422, {
          title: 'Employee not eligible',
          detail: 'no employee record is linked to identity 1234',
        }),
      ),
    );

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/your hr record is not linked yet/i)).toBeVisible();
    expect(screen.getByText('No allocation yet')).toBeVisible();
  });

  it('shows a loading placeholder per card, not one page-wide spinner', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getAllByText(/^loading /i).length).toBeGreaterThan(1);
  });
});

describe('dashboard (P04) — manager tier', () => {
  it('adds the approvals section and a preview for a manager', async () => {
    renderWithProviders(<DashboardPage />, { role: 'MANAGER' });

    expect(await screen.findByText('Awaiting your approval')).toBeVisible();
    expect(screen.getByRole('link', { name: /open approvals/i })).toBeVisible();
    expect(await screen.findByText(/5 days ·/)).toBeVisible();
  });

  it('never asks the manager-only endpoints on behalf of an employee', async () => {
    const inbox = vi.fn();
    server.use(
      http.get(INBOX, () => {
        inbox();
        return HttpResponse.json(pageOf([leaveRequestFixture]));
      }),
    );

    renderWithProviders(<DashboardPage />, { role: 'EMPLOYEE' });
    await screen.findByText('Leave days available');

    expect(screen.queryByText('Awaiting your approval')).not.toBeInTheDocument();
    // The request is certain to be refused, so it is never made.
    expect(inbox).not.toHaveBeenCalled();
  });

  it('says the queue could not be read rather than claiming it is empty', async () => {
    server.use(http.get(INBOX, () => problemResponse(500, { detail: 'leave service error' })));

    renderWithProviders(<DashboardPage />, { role: 'MANAGER' });

    expect(await screen.findAllByText(/leave service error/i)).not.toHaveLength(0);
    expect(screen.queryByText(/nothing awaiting your decision/i)).not.toBeInTheDocument();
  });
});

/**
 * Phase 5 — the HR/ADMIN governance tier. It composes the analytics dashboard,
 * the audit statistics and one directory count; every one of those is an
 * HR/ADMIN endpoint, so the tier must not exist for anyone else and must not
 * fire the requests for them either.
 */
describe('dashboard (P04) — governance tier', () => {
  const ANALYTICS = `${env.apiBaseUrl}/api/analytics/dashboard`;
  const AUDIT_STATS = `${env.apiBaseUrl}/api/hr/audit/statistics`;
  const EMPLOYEES = `${env.apiBaseUrl}/api/hr/employees`;

  it('is absent for an employee, and its HR-only endpoints are never called', async () => {
    const calls: string[] = [];
    server.use(
      http.get(ANALYTICS, ({ request }) => {
        calls.push(request.url);
        return HttpResponse.json(analyticsDashboardFixture);
      }),
      http.get(AUDIT_STATS, ({ request }) => {
        calls.push(request.url);
        return HttpResponse.json(auditStatisticsFixture);
      }),
    );

    renderWithProviders(<DashboardPage />, { role: 'EMPLOYEE' });
    await screen.findByText('Leave days available');

    expect(screen.queryByText('Platform governance')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('shows workforce and document KPIs to HR, behind the availability guard', async () => {
    renderWithProviders(<DashboardPage />, { role: 'HR' });

    expect(await screen.findByText('Platform governance')).toBeVisible();
    expect(await screen.findByText('137')).toBeVisible();
    expect(screen.getByText('Employee records')).toBeVisible();
    expect(screen.getByText('Documents stored')).toBeVisible();
  });

  it('renders an unavailable analytics source as unavailable, never as zeros', async () => {
    server.use(
      http.get(ANALYTICS, () =>
        HttpResponse.json({
          ...analyticsDashboardFixture,
          employees: {
            available: false,
            totalEmployees: 0,
            activeEmployees: 0,
            disabledEmployees: 0,
            departments: 0,
            positions: 0,
          },
        }),
      ),
    );

    renderWithProviders(<DashboardPage />, { role: 'HR' });

    expect(await screen.findByText('Workforce KPIs unavailable')).toBeVisible();
    expect(screen.queryByText('Employee records')).toBeNull();
  });

  it('ranks the provisioning-failure alert first and links to the affected rows', async () => {
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        const failed = new URL(request.url).searchParams.get('provisioningStatus') === 'FAILED';
        return HttpResponse.json(pageOf([], { totalElements: failed ? 2 : 0 }));
      }),
    );

    renderWithProviders(<DashboardPage />, { role: 'HR' });

    expect(await screen.findByText(/2 employee records failed to provision/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /review them/i })).toHaveAttribute(
      'href',
      '/hr/employees?provisioningStatus=FAILED',
    );
  });

  it('raises the failed-action alert from the trail’s own failure convention', async () => {
    renderWithProviders(<DashboardPage />, { role: 'HR' });

    // The fixture records 2 failed actions in the window.
    expect(await screen.findByText(/2 failed actions in the last 30 days/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /open the trail/i })).toHaveAttribute(
      'href',
      '/hr/audit?result=FAILURE',
    );
  });

  it('draws the activity sparkline with an accessible table behind it', async () => {
    renderWithProviders(<DashboardPage />, { role: 'HR' });

    const table = await screen.findByRole('table', { name: /audit activity/i });
    expect(within(table).getByRole('rowheader', { name: '2026-07-31' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '22' })).toBeVisible();
  });

  it('reports a failed audit-statistics fetch without blanking the rest of the tier', async () => {
    server.use(
      http.get(AUDIT_STATS, () => problemResponse(500, { detail: 'audit statistics failed' })),
    );

    renderWithProviders(<DashboardPage />, { role: 'HR' });

    // Reported by both the failed-actions KPI card and the sparkline panel —
    // each resolves independently, so each states its own failure.
    expect((await screen.findAllByText(/audit statistics failed/i)).length).toBeGreaterThan(0);
    // The analytics half still resolved on its own.
    expect(await screen.findByText('137')).toBeVisible();
  });
});
