import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import type { Identity } from '@/shared/auth';
import { escalatedLeaveFixture, leaveBalanceFixture, pageOf } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { identityFixture, renderWithProviders } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

import { BalanceAdminPanel } from './components/BalanceAdminPanel';
import { EscalatedLeavePanel } from './components/EscalatedLeavePanel';

/**
 * P20 — Leave administration.
 *
 * Every assertion here is against a capability `LeaveRequestController` /
 * `LeaveBalanceController` actually have. The two things they do NOT have —
 * a global request list and a status filter on the escalation queue — are
 * asserted as absences, so reintroducing either fails the suite.
 */

const ESCALATED = `${env.apiBaseUrl}/api/leave/requests/escalated`;
const BALANCE = `${env.apiBaseUrl}/api/leave/balances/:employeeId`;
const EMPLOYEE_ID = leaveBalanceFixture.employeeId;

function hrIdentity(overrides: Partial<Identity> = {}): Identity {
  return { ...identityFixture('HR'), ...overrides };
}

describe('escalated leave queue (P20)', () => {
  it('lists the escalated requests with their status and escalation badges', async () => {
    const { container } = renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });

    expect(await screen.findByText('10 Aug 2026 – 14 Aug 2026')).toBeVisible();
    expect(screen.getByText('Submitted')).toBeVisible();
    expect(screen.getByText('Escalated to HR')).toBeVisible();
    // The server counts the working days; the table renders its number.
    expect(screen.getByText('5 days')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('links each row to the request detail the server lets HR read by id', async () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });

    const link = await screen.findByRole('link', { name: '10 Aug 2026 – 14 Aug 2026' });
    expect(link).toHaveAttribute('href', `/leave/${escalatedLeaveFixture.id}`);
  });

  it('offers only the sorts the controller whitelists', async () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    const table = screen.getByRole('table', { name: /escalated to hr/i });
    // LeaveRequestController.SORTABLE = createdAt, status, type, businessDays, decidedAt.
    expect(within(table).getByRole('button', { name: /^type/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /^working days/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /^status/i })).toBeVisible();
    // Not whitelisted: the server silently drops it, so no affordance exists.
    expect(within(table).queryByRole('button', { name: /^period/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /^requested by/i })).toBeNull();
  });

  it('offers no status filter — the endpoint pins the scope to pending', async () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    expect(screen.getByLabelText('Type')).toBeVisible();
    expect(screen.getByLabelText('Period from')).toBeVisible();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('sends the filters the endpoint accepts, server-side', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(ESCALATED, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(pageOf([escalatedLeaveFixture]));
      }),
    );

    renderWithProviders(<EscalatedLeavePanel />, {
      role: 'HR',
      route: '/hr/leave?etype=SICK&efrom=2026-08-01&esearch=holiday',
    });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await waitFor(() => expect(requested?.searchParams.get('type')).toBe('SICK'));
    expect(requested?.searchParams.get('from')).toBe('2026-08-01');
    expect(requested?.searchParams.get('search')).toBe('holiday');
    expect(requested?.searchParams.get('sort')).toBe('createdAt,asc');
  });

  it('pages server-side from the envelope', async () => {
    server.use(
      http.get(ESCALATED, () =>
        HttpResponse.json(pageOf([escalatedLeaveFixture], { totalElements: 45, size: 20 })),
      ),
    );

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    expect(screen.getByText(/45 requests/i)).toBeVisible();
  });

  it('records an approval and refreshes the queue', async () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('button', { name: /^Approve 5 days of annual leave/i }));
    const dialog = await screen.findByRole('dialog');
    // The confirmation names the object and the consequence the server enacts.
    expect(dialog).toHaveTextContent(/debits the requester’s annual balance/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reports the recorded decision in a live region, from the server’s status', async () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('button', { name: /^Approve 5 days of annual leave/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    // A decision that closes its dialog and says nothing has told the operator
    // only that the dialog closed.
    const outcome = await screen.findByRole('status');
    expect(outcome).toHaveTextContent(/approved 2 days of annual leave/i);
    expect(outcome).toHaveTextContent(/annual balance has been debited/i);
  });

  it('sends the decision comment the endpoint accepts', async () => {
    let body: { comment?: string } | undefined;
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests/:id/reject`, async ({ request }) => {
        body = (await request.json()) as { comment?: string };
        return HttpResponse.json({ ...escalatedLeaveFixture, status: 'REJECTED' });
      }),
    );

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('button', { name: /^Reject 5 days of annual leave/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Comment'), 'Cover is not arranged.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(body?.comment).toBe('Cover is not arranged.'));
  });

  it('reads a 409 as a lost race, not a failure', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests/:id/approve`, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'cannot approve a request in status CANCELLED',
        }),
      ),
    );

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('button', { name: /^Approve 5 days of annual leave/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/status CANCELLED/i);
    expect(alert).toHaveTextContent(/someone else got there first/i);
  });

  it('refuses BR-02 self-decision on the row, with the reason stated', async () => {
    // An HR user with no manager lands their OWN request in this queue.
    renderWithProviders(<EscalatedLeavePanel />, {
      identity: hrIdentity({ subject: escalatedLeaveFixture.employeeKeycloakId }),
    });
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    expect(screen.getByRole('button', { name: /^Approve 5 days/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject 5 days/i })).toBeDisabled();
    expect(screen.getByText(/cannot decide your own leave request \(BR-02\)/i)).toBeVisible();
  });

  it('distinguishes an empty queue from an empty filter result', async () => {
    server.use(http.get(ESCALATED, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    expect(await screen.findByText(/nothing escalated to hr/i)).toBeVisible();
    unmount();

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR', route: '/hr/leave?etype=SICK' });
    expect(await screen.findByText(/no escalated requests match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s own words', async () => {
    server.use(
      http.get(ESCALATED, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }),
      ),
    );

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    expect(await screen.findByText('Access is denied')).toBeVisible();
    expect(screen.getByText(/corr-test-0001/)).toBeVisible();
  });

  it('keeps 503 distinct from a failed request', async () => {
    server.use(
      http.get(ESCALATED, () =>
        problemResponse(503, {
          title: 'HR service unavailable',
          detail: 'The HR directory is unreachable.',
        }),
      ),
    );

    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    expect(await screen.findByText(/data unavailable right now/i)).toBeVisible();
    expect(screen.getByText(/try again shortly/i)).toBeVisible();
  });

  it('shows a layout-shaped skeleton while loading, not a spinner', () => {
    renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });
    expect(screen.getByText(/loading leave requests escalated to hr/i)).toBeInTheDocument();
  });

  it('becomes cards below md rather than a sideways-scrolling table', async () => {
    setViewport(375);
    const { container } = renderWithProviders(<EscalatedLeavePanel />, { role: 'HR' });

    await screen.findByText('10 Aug 2026 – 14 Aug 2026');
    expect(screen.queryByRole('table')).toBeNull();
    // The decision is still reachable on a phone.
    expect(screen.getByRole('button', { name: /^Approve 5 days of annual leave/i })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
    setViewport(1280);
  });
});

describe('balance administration (P20)', () => {
  /**
   * The panel is controlled: the composing page owns the employee and the year
   * so both can live in the URL. The harness plays that page.
   */
  function renderPanel(employeeId: string | null = EMPLOYEE_ID) {
    function Harness() {
      const [year, setYear] = useState(new Date().getFullYear());
      return (
        <BalanceAdminPanel
          employeeId={employeeId}
          year={year}
          onYearChange={setYear}
          picker={<div>picker slot</div>}
        />
      );
    }
    return renderWithProviders(<Harness />, { role: 'HR' });
  }

  it('asks for an employee before it fetches anything', async () => {
    renderPanel(null);
    expect(await screen.findByText(/choose an employee/i)).toBeVisible();
  });

  it('shows the allocation the server holds, with the meter spelled out', async () => {
    const { container } = renderPanel();

    const meter = await screen.findByRole('meter');
    expect(meter).toHaveAttribute('aria-valuetext', '12 of 25 days used, 13 available');
    // Both section headings are h2 under the page h1 — no skipped level.
    expect(screen.getByRole('heading', { level: 2, name: /allocation for/i })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: /adjust the allocation/i })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reads the balance by EMPLOYEE id and passes the chosen year', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(BALANCE, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(leaveBalanceFixture);
      }),
    );

    renderPanel();
    await screen.findByRole('meter');

    expect(requested?.pathname).toBe(`/api/leave/balances/${EMPLOYEE_ID}`);
    expect(requested?.searchParams.get('year')).toBe(String(new Date().getFullYear()));
  });

  it('states the floor before the user can cross it', async () => {
    renderPanel();
    await screen.findByRole('meter');

    expect(
      screen.getByText(/cannot go below the 12 day\(s\) already used this year/i),
    ).toBeVisible();
  });

  it('adjusts the allocation and reports the server’s figures', async () => {
    let body: { totalDays: number; reason?: string } | undefined;
    server.use(
      http.put(BALANCE, async ({ request }) => {
        body = (await request.json()) as { totalDays: number; reason?: string };
        return HttpResponse.json({
          ...leaveBalanceFixture,
          totalDays: 30,
          availableDays: 18,
        });
      }),
    );

    renderPanel();
    await screen.findByRole('meter');

    const days = screen.getByLabelText(/annual allocation \(days\)/i);
    await userEvent.clear(days);
    await userEvent.type(days, '30');
    await userEvent.type(screen.getByLabelText('Reason'), 'Carry-over agreed with the manager.');
    await userEvent.click(screen.getByRole('button', { name: 'Save allocation' }));

    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(/set to 30 days/i);
    expect(alert).toHaveTextContent(/18 now available after 12 used/i);
    expect(body).toEqual({ totalDays: 30, reason: 'Carry-over agreed with the manager.' });
  });

  it('validates the allocation client-side against the Bean Validation mirror', async () => {
    renderPanel();
    await screen.findByRole('meter');

    const days = screen.getByLabelText(/annual allocation \(days\)/i);
    await userEvent.clear(days);
    await userEvent.type(days, '12.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save allocation' }));

    expect(await screen.findByText(/whole number of days/i)).toBeVisible();
  });

  it('renders the server’s 422 sentence when the floor is crossed, and keeps the input', async () => {
    server.use(
      http.put(BALANCE, () =>
        problemResponse(422, {
          title: 'Business rule violation',
          detail: 'allocation 5 is below the 12 day(s) already used',
        }),
      ),
    );

    renderPanel();
    await screen.findByRole('meter');

    const days = screen.getByLabelText(/annual allocation \(days\)/i);
    await userEvent.clear(days);
    await userEvent.type(days, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save allocation' }));

    expect(
      await screen.findByText(/allocation 5 is below the 12 day\(s\) already used/i),
    ).toBeVisible();
    // Never wipe input on a server error.
    expect(days).toHaveValue('5');
    expect(screen.getByText(/corr-test-0001/)).toBeVisible();
  });

  it('maps a 400 field error onto the field it names', async () => {
    server.use(
      http.put(BALANCE, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          errors: { totalDays: 'must be greater than or equal to 0' },
        }),
      ),
    );

    renderPanel();
    await screen.findByRole('meter');
    await userEvent.click(screen.getByRole('button', { name: 'Save allocation' }));

    expect(await screen.findByText('must be greater than or equal to 0')).toBeVisible();
    expect(screen.getByLabelText(/annual allocation \(days\)/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('separates "no such employee" (404) from "no identity link yet" (422)', async () => {
    server.use(
      http.get(BALANCE, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'employee not found' }),
      ),
    );

    const { unmount } = renderPanel();
    expect(await screen.findByText(/no such employee/i)).toBeVisible();
    unmount();

    server.use(
      http.get(BALANCE, () =>
        problemResponse(422, {
          title: 'Employee not eligible',
          detail: 'employee has no identity link yet; identity onboarding must run first',
        }),
      ),
    );
    renderPanel();
    expect(await screen.findByText(/no allocation yet/i)).toBeVisible();
    expect(screen.getByText(/identity onboarding must run first/i)).toBeVisible();
  });

  it('reloads the form when the leave year changes', async () => {
    const thisYear = new Date().getFullYear();
    server.use(
      http.get(BALANCE, ({ request }) => {
        const year = Number(new URL(request.url).searchParams.get('year'));
        return HttpResponse.json(
          year === thisYear
            ? leaveBalanceFixture
            : {
                ...leaveBalanceFixture,
                id: 'prior-year-row',
                year,
                totalDays: 20,
                usedDays: 20,
                availableDays: 0,
              },
        );
      }),
    );

    renderPanel();
    await screen.findByRole('meter');
    expect(screen.getByLabelText(/annual allocation \(days\)/i)).toHaveValue('25');

    await userEvent.selectOptions(screen.getByLabelText('Leave year'), String(thisYear - 1));

    // The form belongs to the row, not to the panel: a different year is a
    // different allocation and must not carry the previous one's figures.
    await waitFor(() =>
      expect(screen.getByLabelText(/annual allocation \(days\)/i)).toHaveValue('20'),
    );
    expect(screen.getByText(/cannot go below the 20 day\(s\) already used/i)).toBeVisible();
  });

  it('renders a 403 on the balance read inline', async () => {
    server.use(
      http.get(BALANCE, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }),
      ),
    );

    renderPanel();
    expect(await screen.findByText('Access is denied')).toBeVisible();
  });
});
