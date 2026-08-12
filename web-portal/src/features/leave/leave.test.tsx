import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  approvedLeaveFixture,
  escalatedLeaveFixture,
  leaveRequestFixture,
  pageOf,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';

import { LeaveInboxPanel } from './components/LeaveInboxPanel';
import { LeaveDetailPage } from './pages/LeaveDetailPage';
import { MyLeavePage } from './pages/MyLeavePage';

const MY = `${env.apiBaseUrl}/api/leave/requests/my`;
const BALANCE = `${env.apiBaseUrl}/api/leave/balances/my`;
const INBOX = `${env.apiBaseUrl}/api/leave/requests/inbox`;
const ONE = `${env.apiBaseUrl}/api/leave/requests/:id`;

describe('my leave (P05)', () => {
  it('shows the balance meter and the request list', async () => {
    const { container } = renderWithProviders(<MyLeavePage />);

    // The meter states its value in words, not only as a bar.
    const meter = await screen.findByRole('meter');
    expect(meter).toHaveAttribute('aria-valuetext', '12 of 25 days used, 13 available');
    expect(screen.getByText('10 Aug 2026 – 14 Aug 2026')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders server-computed working days rather than counting them itself', async () => {
    server.use(
      http.get(MY, () =>
        // 3 calendar days that the SERVER says are 2 working days. A client that
        // counted for itself would contradict the record.
        HttpResponse.json(
          pageOf([
            {
              ...leaveRequestFixture,
              startDate: '2026-08-10',
              endDate: '2026-08-12',
              businessDays: 2,
            },
          ]),
        ),
      ),
    );

    renderWithProviders(<MyLeavePage />);
    expect(await screen.findByText('2 days')).toBeVisible();
  });

  it('offers cancellation only while a request is still pending', async () => {
    renderWithProviders(<MyLeavePage />);
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    // One SUBMITTED + one APPROVED in the fixture page.
    expect(screen.getAllByRole('button', { name: /cancel your leave request for/i })).toHaveLength(
      1,
    );
  });

  it('names the object and its consequences before cancelling', async () => {
    renderWithProviders(<MyLeavePage />);
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');

    await userEvent.click(screen.getByRole('button', { name: /cancel your leave request for/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/5-working-day request/i);
    expect(dialog).toHaveTextContent(/manager no longer sees it/i);
  });

  it('explains a 409 when the request was decided while the dialog was open', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests/:id/cancel`, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'cannot cancel a leave request in status APPROVED',
        }),
      ),
    );

    renderWithProviders(<MyLeavePage />);
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');
    await userEvent.click(screen.getByRole('button', { name: /cancel your leave request for/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/status APPROVED/i);
  });

  it('distinguishes "no requests yet" from "nothing matches"', async () => {
    server.use(http.get(MY, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(<MyLeavePage />);
    expect(await screen.findByText(/no leave requests yet/i)).toBeVisible();
    unmount();

    renderWithProviders(<MyLeavePage />, { route: '/leave?status=REJECTED' });
    expect(await screen.findByText(/no requests match these filters/i)).toBeVisible();
  });

  it('treats a missing balance as an empty state, not a failure', async () => {
    server.use(http.get(BALANCE, () => problemResponse(404, { detail: 'no employee record' })));

    renderWithProviders(<MyLeavePage />);
    expect(await screen.findByText(/no leave balance yet/i)).toBeVisible();
  });
});

describe('leave request form', () => {
  async function openForm() {
    renderWithProviders(<MyLeavePage />);
    await screen.findByText('10 Aug 2026 – 14 Aug 2026');
    await userEvent.click(screen.getByRole('button', { name: /request leave/i }));
    return screen.findByRole('dialog');
  }

  it('labels every field visibly and states constraints before errors', async () => {
    const dialog = await openForm();

    expect(within(dialog).getByLabelText(/leave type/i)).toBeVisible();
    expect(within(dialog).getByLabelText(/first day/i)).toBeVisible();
    expect(within(dialog).getByLabelText(/last day/i)).toBeVisible();
    // The balance is stated up front, where it can prevent a mistake.
    expect(dialog).toHaveTextContent(/13 days available/i);
    expect(dialog).toHaveTextContent(/cannot span two calendar years/i);
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('rejects an inverted period on the client, before a round trip', async () => {
    const dialog = await openForm();

    await userEvent.type(within(dialog).getByLabelText(/first day/i), '2026-08-20');
    await userEvent.type(within(dialog).getByLabelText(/last day/i), '2026-08-10');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit request/i }));

    expect(
      await within(dialog).findByText(/last day cannot be before the first day/i),
    ).toBeVisible();
  });

  it('submits a valid request and closes', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(leaveRequestFixture);
      }),
    );

    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText(/first day/i), '2026-09-01');
    await userEvent.type(within(dialog).getByLabelText(/last day/i), '2026-09-03');
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Conference');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit request/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bodies[0]).toMatchObject({
      type: 'ANNUAL',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      reason: 'Conference',
    });
  });

  it('renders the BR-01 sentence the domain wrote, and keeps the input', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests`, () =>
        problemResponse(
          422,
          {
            title: 'Business rule violation',
            detail: 'requested 5 business day(s) but only 3 available',
            rule: 'BR-01',
          },
          'corr-br01',
        ),
      ),
    );

    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText(/first day/i), '2026-09-01');
    await userEvent.type(within(dialog).getByLabelText(/last day/i), '2026-09-05');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit request/i }));

    const alert = await within(dialog).findByRole('alert');
    // The specific guidance, never a generic 422.
    expect(alert).toHaveTextContent('requested 5 business day(s) but only 3 available');
    expect(alert).toHaveTextContent('BR-01');
    expect(alert).toHaveTextContent('corr-br01');
    // Input survives — the user fixes it rather than retyping it.
    expect(within(dialog).getByLabelText(/first day/i)).toHaveValue('2026-09-01');
  });

  it('lands a 400 field error on the field it names', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests`, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          errors: { startDate: 'must not be null' },
        }),
      ),
    );

    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText(/first day/i), '2026-09-01');
    await userEvent.type(within(dialog).getByLabelText(/last day/i), '2026-09-03');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit request/i }));

    const field = await within(dialog).findByLabelText(/first day/i);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText('must not be null')).toBeVisible();
  });
});

describe('leave detail (P06)', () => {
  it('shows the request and says who decides it when it is escalated', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(escalatedLeaveFixture)));

    const { container } = renderAtRoute('/leave/:id', <LeaveDetailPage />, {
      route: `/leave/${escalatedLeaveFixture.id}`,
    });

    expect(await screen.findByText(/escalated to hr/i)).toBeVisible();
    expect(screen.getByText(/hr sees it in their approvals inbox/i)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the decision trail once decided', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(approvedLeaveFixture)));

    renderAtRoute('/leave/:id', <LeaveDetailPage />, {
      route: `/leave/${leaveRequestFixture.id}`,
    });

    expect(await screen.findByText('Approved')).toBeVisible();
    expect(screen.getByText('Enjoy.')).toBeVisible();
  });

  it('renders a 403 inline — the request exists, it is just not yours', async () => {
    server.use(
      http.get(ONE, () =>
        problemResponse(403, { detail: 'not allowed to view this leave request' }),
      ),
    );

    renderAtRoute('/leave/:id', <LeaveDetailPage />, {
      route: `/leave/${leaveRequestFixture.id}`,
    });

    expect(await screen.findByText('not allowed to view this leave request')).toBeVisible();
    expect(screen.getByText(/you are signed in/i)).toBeVisible();
  });

  it('renders a 404 as "does not exist", not as an error', async () => {
    server.use(http.get(ONE, () => problemResponse(404, { detail: 'leave request not found' })));

    renderAtRoute('/leave/:id', <LeaveDetailPage />, {
      route: `/leave/${leaveRequestFixture.id}`,
    });

    expect(await screen.findByText(/this leave request does not exist/i)).toBeVisible();
  });
});

describe('leave inbox (P14, leave tab)', () => {
  it('lists what is waiting and offers a decision per row', async () => {
    const { container } = renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });

    await screen.findByRole('table', { name: /awaiting your decision/i });
    // Row actions name their row: a queue of identically-named buttons gives a
    // screen-reader user nothing to choose between.
    expect(screen.getByRole('button', { name: /^approve 5 days of annual leave/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /^reject 5 days of annual leave/i })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('states the consequence of approving before it happens', async () => {
    renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });

    await userEvent.click(screen.getByRole('button', { name: /^approve \d/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/debits the requester’s annual balance immediately/i);
  });

  it('does not promise a balance debit for a type that does not draw on it', async () => {
    server.use(
      http.get(INBOX, () => HttpResponse.json(pageOf([{ ...leaveRequestFixture, type: 'SICK' }]))),
    );

    renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });
    await userEvent.click(screen.getByRole('button', { name: /^approve \d/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/does not draw on the annual balance/i);
    expect(dialog).not.toHaveTextContent(/debits/i);
  });

  it('sends the decision with its comment', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests/:id/approve`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(approvedLeaveFixture);
      }),
    );

    renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });
    await userEvent.click(screen.getByRole('button', { name: /^approve \d/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/comment/i), 'Fine by me');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(bodies[0]).toEqual({ comment: 'Fine by me' }));
  });

  it('treats a 409 as a lost race and refreshes the queue', async () => {
    const refetches = vi.fn();
    server.use(
      http.get(INBOX, () => {
        refetches();
        return HttpResponse.json(pageOf([leaveRequestFixture]));
      }),
      http.post(`${env.apiBaseUrl}/api/leave/requests/:id/approve`, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'cannot approve a leave request in status APPROVED',
        }),
      ),
    );

    renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });
    const callsBefore = refetches.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /^approve \d/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/already decided/i);
    expect(alert).toHaveTextContent(/someone else got there first/i);
    await waitFor(() => expect(refetches.mock.calls.length).toBeGreaterThan(callsBefore));
    // No retry offered for a race — only a way out.
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('gives a positive empty state when nothing is waiting', async () => {
    server.use(http.get(INBOX, () => HttpResponse.json(pageOf([]))));

    renderWithProviders(<LeaveInboxPanel />, { role: 'MANAGER' });

    expect(await screen.findByText(/nothing awaiting your approval/i)).toBeVisible();
  });
});
