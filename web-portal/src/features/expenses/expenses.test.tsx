import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  expenseFixture,
  pageOf,
  secondApprovalExpenseFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';

import { ExpenseQueuePanel } from './components/ExpenseQueuePanel';
import { ExpenseDetailPage } from './pages/ExpenseDetailPage';
import { MyExpensesPage } from './pages/MyExpensesPage';

const MY = `${env.apiBaseUrl}/api/expenses/my`;
const PENDING = `${env.apiBaseUrl}/api/expenses/pending`;
const ONE = `${env.apiBaseUrl}/api/expenses/:id`;
const APPROVE = `${env.apiBaseUrl}/api/expenses/:id/approve`;

describe('my expenses (P07)', () => {
  it('lists claims with amounts in their own currency', async () => {
    const { container } = renderWithProviders(<MyExpensesPage />);

    expect(await screen.findByText('Return train, Casablanca')).toBeVisible();
    // No conversion, ever: the platform enforces one currency per claim and
    // knows nothing about exchange rates.
    expect(screen.getByText(/MAD\s*249\.90/)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('never renders PENDING_SECOND_APPROVAL as approved', async () => {
    renderWithProviders(<MyExpensesPage />);
    // Wait for the ROW, not for the filter option that shares its wording.
    await screen.findByText('Certification course');

    expect(screen.getByText(/above the threshold — awaiting hr sign-off/i)).toBeVisible();
    expect(screen.getByTitle('PENDING_SECOND_APPROVAL')).toHaveTextContent(
      'Pending second approval',
    );
    // The word "Approved" must not appear as a status for that row.
    expect(screen.queryByTitle('APPROVED')).not.toBeInTheDocument();
  });

  it('offers cancellation only while a claim is still first-level pending', async () => {
    renderWithProviders(<MyExpensesPage />);
    await screen.findByText('Return train, Casablanca');

    // SUBMITTED can be withdrawn; PENDING_SECOND_APPROVAL cannot.
    expect(screen.getAllByRole('button', { name: /cancel your .* claim from/i })).toHaveLength(1);
  });

  it('distinguishes "no claims yet" from "nothing matches"', async () => {
    server.use(http.get(MY, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(<MyExpensesPage />);
    expect(await screen.findByText(/no expense claims yet/i)).toBeVisible();
    unmount();

    renderWithProviders(<MyExpensesPage />, { route: '/expenses?category=MEALS' });
    expect(await screen.findByText(/no claims match these filters/i)).toBeVisible();
  });

  it('shows the server detail and a retry when the list fails', async () => {
    server.use(
      http.get(MY, () =>
        problemResponse(503, { title: 'HR service unavailable', detail: 'directory is down' }),
      ),
    );

    renderWithProviders(<MyExpensesPage />);

    // 503 is "wait", not "fix and retry" — it gets the degraded-dependency
    // banner rather than a failure panel.
    expect(await screen.findByText(/directory is down/i)).toBeVisible();
    expect(screen.getByText(/dependency being unreachable/i)).toBeVisible();
  });
});

describe('expense form', () => {
  async function openForm() {
    renderWithProviders(<MyExpensesPage />);
    await screen.findByText('Return train, Casablanca');
    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));
    return screen.findByRole('dialog');
  }

  it('states the threshold RULE rather than a number it cannot read', async () => {
    const dialog = await openForm();
    // GET /api/expenses/threshold is HR-only: this client would get 403, so the
    // form must not display a figure it has no way to know.
    expect(dialog).toHaveTextContent(/above the company threshold need a second approval/i);
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('offers no currency picker — the deployment currency is applied server-side', async () => {
    const dialog = await openForm();
    expect(within(dialog).queryByLabelText(/currency/i)).toBeNull();
  });

  it('rejects a future date and more than two decimals before submitting', async () => {
    const dialog = await openForm();

    await userEvent.type(within(dialog).getByLabelText(/amount/i), '10.999');
    await userEvent.type(within(dialog).getByLabelText(/date of expense/i), '2099-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit claim/i }));

    expect(await within(dialog).findByText(/at most 2 decimal places/i)).toBeVisible();
    expect(within(dialog).getByText(/cannot be in the future/i)).toBeVisible();
  });

  it('submits a numeric amount, not the raw string', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${env.apiBaseUrl}/api/expenses`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(expenseFixture);
      }),
    );

    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText(/amount/i), '42.50');
    await userEvent.type(within(dialog).getByLabelText(/date of expense/i), '2026-07-01');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit claim/i }));

    await waitFor(() => expect(bodies[0]).toMatchObject({ amount: 42.5, category: 'TRAVEL' }));
  });

  it('keeps input and shows the server message when the claim is refused', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/api/expenses`, () =>
        problemResponse(
          422,
          { title: 'Employee not eligible', detail: 'employee is not active' },
          'corr-x422',
        ),
      ),
    );

    const dialog = await openForm();
    await userEvent.type(within(dialog).getByLabelText(/amount/i), '42.50');
    await userEvent.type(within(dialog).getByLabelText(/date of expense/i), '2026-07-01');
    await userEvent.click(within(dialog).getByRole('button', { name: /submit claim/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('employee is not active');
    expect(alert).toHaveTextContent('corr-x422');
    expect(within(dialog).getByLabelText(/amount/i)).toHaveValue('42.50');
  });
});

describe('expense detail (P08)', () => {
  it('renders the two-step trail and says the second step is outstanding', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(secondApprovalExpenseFixture)));

    const { container } = renderAtRoute('/expenses/:id', <ExpenseDetailPage />, {
      route: `/expenses/${secondApprovalExpenseFixture.id}`,
    });

    expect(await screen.findByText(/approved once — awaiting a second approval/i)).toBeVisible();
    expect(screen.getByText('First approval')).toBeVisible();
    expect(screen.getByText('Second approval (HR)')).toBeVisible();
    expect(screen.getByText(/has not signed it off yet/i)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows only one step for a claim below the threshold', async () => {
    server.use(
      http.get(ONE, () =>
        HttpResponse.json({
          ...expenseFixture,
          status: 'APPROVED',
          firstApprovedAt: '2026-07-05T10:00:00Z',
          decidedAt: '2026-07-05T10:00:00Z',
        }),
      ),
    );

    renderAtRoute('/expenses/:id', <ExpenseDetailPage />, {
      route: `/expenses/${expenseFixture.id}`,
    });

    expect(await screen.findByText('First approval')).toBeVisible();
    expect(screen.queryByText('Second approval (HR)')).not.toBeInTheDocument();
  });
});

describe('expense queue (P14, expenses tab)', () => {
  it('warns that approving may route to a second sign-off, not finalise', async () => {
    renderWithProviders(<ExpenseQueuePanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });

    await userEvent.click(screen.getByRole('button', { name: /^approve .* claim from/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      /sends it for a second sign-off by HR rather than finalising/i,
    );
  });

  it('reports "sent for second-level approval" when that is what the server did', async () => {
    server.use(http.post(APPROVE, () => HttpResponse.json(secondApprovalExpenseFixture)));

    renderWithProviders(<ExpenseQueuePanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });
    await userEvent.click(screen.getByRole('button', { name: /^approve .* claim from/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    const outcome = await screen.findByText(/sent for second-level approval/i);
    expect(outcome).toBeVisible();
    // The manager is never told a claim is approved when it is not.
    expect(screen.queryByText(/^4,800.00 MAD approved\.$/)).not.toBeInTheDocument();
  });

  it('reports a plain approval when the server finalised it', async () => {
    server.use(
      http.post(APPROVE, () => HttpResponse.json({ ...expenseFixture, status: 'APPROVED' })),
    );

    renderWithProviders(<ExpenseQueuePanel />, { role: 'MANAGER' });
    await screen.findByRole('table', { name: /awaiting your decision/i });
    await userEvent.click(screen.getByRole('button', { name: /^approve .* claim from/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/approved\./i)).toBeVisible();
    expect(screen.queryByText(/second-level/i)).not.toBeInTheDocument();
  });

  it('gives a positive empty state when the queue is clear', async () => {
    server.use(http.get(PENDING, () => HttpResponse.json(pageOf([]))));

    renderWithProviders(<ExpenseQueuePanel />, { role: 'MANAGER' });

    expect(await screen.findByText(/nothing awaiting your approval/i)).toBeVisible();
  });
});
