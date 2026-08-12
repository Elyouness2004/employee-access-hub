import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import type { Identity } from '@/shared/auth';
import {
  escalatedExpenseFixture,
  expenseFixture,
  pageOf,
  secondApprovalExpenseFixture,
  thresholdFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { identityFixture, renderWithProviders } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

import { expenseKeys } from './api/expenses-api';
import { ExpenseAdminQueue } from './components/ExpenseAdminQueue';
import { ThresholdPanel } from './components/ThresholdPanel';
import { ExpenseAdminPage } from './pages/ExpenseAdminPage';

/**
 * P21 — Expense administration.
 *
 * The contract facts under test: three server-scoped collections behind one
 * component, a status filter only where `/search` accepts one, decisions only
 * where a claim can still be decided, BR-02/BR-03 refusals stated on the row,
 * `PENDING_SECOND_APPROVAL` never reported as approved, and the threshold with
 * its real provenance.
 */

const ESCALATED = `${env.apiBaseUrl}/api/expenses/escalated`;
const SECOND = `${env.apiBaseUrl}/api/expenses/second-approval`;
const SEARCH = `${env.apiBaseUrl}/api/expenses/search`;
const THRESHOLD = `${env.apiBaseUrl}/api/expenses/threshold`;
const APPROVE = `${env.apiBaseUrl}/api/expenses/:id/approve`;

function hrIdentity(overrides: Partial<Identity> = {}): Identity {
  return { ...identityFixture('HR'), ...overrides };
}

function escalatedQueue() {
  return (
    <ExpenseAdminQueue
      scope="escalated"
      namespace="e"
      caption="Expense claims escalated to HR"
      emptyTitle="Nothing escalated to HR"
      emptyDescription="A claim lands here when its owner has no manager who can decide it (BR-02)."
    />
  );
}

function secondApprovalQueue() {
  return (
    <ExpenseAdminQueue
      scope="second-approval"
      namespace="s"
      caption="Claims awaiting a second-level approval"
      emptyTitle="No claims awaiting a second approval"
      emptyDescription="A claim reaches this queue when its first approval put it above the threshold (BR-03)."
    />
  );
}

function searchQueue() {
  return (
    <ExpenseAdminQueue
      scope="search"
      namespace="a"
      caption="All expense claims"
      emptyTitle="No claims on record"
      emptyDescription="Nobody has submitted an expense claim yet."
    />
  );
}

describe('escalated expense queue (P21)', () => {
  it('lists the escalated claims with amount, status and escalation', async () => {
    const { container } = renderWithProviders(escalatedQueue(), { role: 'HR' });

    expect(await screen.findByText('MAD 89.50')).toBeVisible();
    expect(screen.getByText('Submitted')).toBeVisible();
    expect(screen.getByText('Escalated to HR')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers only the sorts ExpenseController whitelists', async () => {
    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('MAD 89.50');

    const table = screen.getByRole('table', { name: /escalated to hr/i });
    // SORTABLE = createdAt, expenseDate, status, category, decidedAt.
    expect(within(table).getByRole('button', { name: /^date/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /^category/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /^status/i })).toBeVisible();
    // `amount` is NOT sortable server-side, despite being a filter.
    expect(within(table).queryByRole('button', { name: /^amount/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /^claimed by/i })).toBeNull();
  });

  it('offers no status filter — the queue pins its own status in SQL', async () => {
    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('MAD 89.50');

    expect(screen.getByLabelText('Category')).toBeVisible();
    expect(screen.getByLabelText('Min amount')).toBeVisible();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('sends every filter server-side, including the amount range', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(ESCALATED, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(pageOf([escalatedExpenseFixture]));
      }),
    );

    renderWithProviders(escalatedQueue(), {
      role: 'HR',
      route: '/hr/expenses?ecategory=TRAVEL&efrom=2026-07-01&emin=50&emax=500&esearch=train',
    });
    await screen.findByText('MAD 89.50');

    await waitFor(() => expect(requested?.searchParams.get('category')).toBe('TRAVEL'));
    expect(requested?.searchParams.get('from')).toBe('2026-07-01');
    expect(requested?.searchParams.get('minAmount')).toBe('50');
    expect(requested?.searchParams.get('maxAmount')).toBe('500');
    expect(requested?.searchParams.get('search')).toBe('train');
    expect(requested?.searchParams.get('sort')).toBe('createdAt,asc');
  });

  it('reports "sent for second-level approval" rather than "approved"', async () => {
    server.use(
      http.post(APPROVE, () =>
        // BR-03: the server, not the client, decides this outcome.
        HttpResponse.json({
          ...escalatedExpenseFixture,
          status: 'PENDING_SECOND_APPROVAL',
          secondApprovalRequired: true,
        }),
      ),
    );

    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('MAD 89.50');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s89\.50 claim/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    const outcome = await screen.findByRole('status');
    expect(outcome).toHaveTextContent(/sent for second-level approval/i);
    expect(outcome).not.toHaveTextContent(/^MAD 89\.50 approved\.$/);
  });

  it('names which outcome the approval produces, per claim, from the real threshold', async () => {
    // MAD 89.50 against a MAD 3,000 threshold: this click FINALISES the claim,
    // and BR-04 makes that terminal. Saying only "above the threshold it goes
    // for a second sign-off" would promise a reversibility that does not exist.
    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('MAD 89.50');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s89\.50 claim/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/at or below the .*3,000\.00 threshold/i);
    expect(dialog).toHaveTextContent(/approving finalises it now/i);
    expect(dialog).toHaveTextContent(/cannot be changed \(BR-04\)/i);
  });

  it('says a second sign-off is coming when the claim IS above the threshold', async () => {
    server.use(
      http.get(ESCALATED, () =>
        HttpResponse.json(pageOf([{ ...escalatedExpenseFixture, amount: 7500 }])),
      ),
    );

    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('MAD 7,500.00');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s7,500\.00 claim/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/above the .*3,000\.00 threshold/i);
    expect(dialog).toHaveTextContent(/second sign-off/i);
    expect(dialog).not.toHaveTextContent(/finalises it now/i);
  });

  it('says the server will refuse when the claim and the threshold differ in currency', async () => {
    server.use(
      http.get(ESCALATED, () =>
        // `Money.isGreaterThan` throws on a currency mismatch — the server
        // answers 422 rather than deciding, so the row must not promise either
        // outcome.
        HttpResponse.json(pageOf([{ ...escalatedExpenseFixture, currency: 'EUR' }])),
      ),
    );

    renderWithProviders(escalatedQueue(), { role: 'HR' });
    await screen.findByText('€89.50');

    await userEvent.click(screen.getByRole('button', { name: /^Approve €89\.50 claim/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/cannot be compared/i);
    expect(dialog).toHaveTextContent(/will refuse this approval/i);
  });

  it('does not count a status parameter the queue never sends', async () => {
    server.use(http.get(ESCALATED, () => HttpResponse.json(pageOf([]))));

    // A stale `estatus` in the URL must not turn an empty queue into "nothing
    // matches these filters" — the queue never sends status, so nothing was
    // filtered.
    renderWithProviders(escalatedQueue(), { role: 'HR', route: '/hr/expenses?estatus=APPROVED' });

    expect(await screen.findByText(/nothing escalated to hr/i)).toBeVisible();
    expect(screen.queryByText(/no claims match these filters/i)).not.toBeInTheDocument();
  });

  it('refuses a self-decision on the row with the BR-02 reason stated', async () => {
    renderWithProviders(escalatedQueue(), {
      identity: hrIdentity({ subject: escalatedExpenseFixture.employeeKeycloakId }),
    });
    await screen.findByText('MAD 89.50');

    expect(screen.getByRole('button', { name: /^Approve MAD\s89\.50 claim/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject MAD\s89\.50 claim/i })).toBeDisabled();
    expect(screen.getByText(/cannot decide your own claim \(BR-02\)/i)).toBeVisible();
  });

  it('distinguishes an empty queue from an empty filter result', async () => {
    server.use(http.get(ESCALATED, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(escalatedQueue(), { role: 'HR' });
    expect(await screen.findByText(/nothing escalated to hr/i)).toBeVisible();
    unmount();

    renderWithProviders(escalatedQueue(), { role: 'HR', route: '/hr/expenses?ecategory=MEALS' });
    expect(await screen.findByText(/no claims match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s wording and the correlation id', async () => {
    server.use(
      http.get(ESCALATED, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }),
      ),
    );

    renderWithProviders(escalatedQueue(), { role: 'HR' });
    expect(await screen.findByText('Access is denied')).toBeVisible();
    expect(screen.getByText(/corr-test-0001/)).toBeVisible();
  });

  it('keeps a 503 distinct from a failed request', async () => {
    server.use(
      http.get(ESCALATED, () =>
        problemResponse(503, {
          title: 'HR service unavailable',
          detail: 'The HR directory is unreachable.',
        }),
      ),
    );

    renderWithProviders(escalatedQueue(), { role: 'HR' });
    expect(await screen.findByText(/data unavailable right now/i)).toBeVisible();
  });

  it('shows a layout-shaped skeleton while loading', () => {
    renderWithProviders(escalatedQueue(), { role: 'HR' });
    expect(screen.getByText(/loading expense claims escalated to hr/i)).toBeInTheDocument();
  });

  it('becomes cards below md, and the card does not repeat its own heading', async () => {
    setViewport(375);
    const { container } = renderWithProviders(escalatedQueue(), { role: 'HR' });

    await screen.findByText('MAD 89.50');
    expect(screen.queryByRole('table')).toBeNull();
    // The amount IS the card heading, so it must appear exactly once.
    expect(screen.getAllByText('MAD 89.50')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Approve MAD\s89\.50 claim/i })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
    setViewport(1280);
  });
});

describe('second-approval queue (P21)', () => {
  it('names the first approver and never renders the state as approved', async () => {
    const { container } = renderWithProviders(secondApprovalQueue(), { role: 'HR' });

    expect(await screen.findByText('MAD 4,800.00')).toBeVisible();
    expect(screen.getByText('Pending second approval')).toBeVisible();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    // The row stores the first approver as a Keycloak subject; the shared
    // resolver turns it into the person who actually approved it.
    expect(await screen.findByText('Youssef Alami')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('refuses the approval to the first approver but still allows a rejection (BR-03)', async () => {
    renderWithProviders(secondApprovalQueue(), {
      identity: hrIdentity({ subject: secondApprovalExpenseFixture.firstApproverKeycloakId! }),
    });
    await screen.findByText('MAD 4,800.00');

    expect(screen.getByRole('button', { name: /^Approve MAD\s4,800\.00 claim/i })).toBeDisabled();
    // `Expense.reject` checks only that the decider is not the CLAIMANT, so the
    // first approver may reject — the two refusals are genuinely different.
    expect(screen.getByRole('button', { name: /^Reject MAD\s4,800\.00 claim/i })).toBeEnabled();
    expect(screen.getByText(/the second must come from someone else \(BR-03\)/i)).toBeVisible();
  });

  it('lets a different HR user finalise the claim', async () => {
    server.use(
      http.post(APPROVE, () =>
        HttpResponse.json({ ...secondApprovalExpenseFixture, status: 'APPROVED' }),
      ),
    );

    renderWithProviders(secondApprovalQueue(), { role: 'HR' });
    await screen.findByText('MAD 4,800.00');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s4,800\.00 claim/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/second-level sign-off — approving finalises the claim/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/MAD 4,800\.00 approved/i);
  });

  it('renders the server’s 422 when it refuses the dual-approver rule anyway', async () => {
    server.use(
      http.post(APPROVE, () =>
        problemResponse(422, {
          title: 'Business rule violation',
          detail: 'second-level approval must be given by someone other than the first approver',
        }),
      ),
    );

    renderWithProviders(secondApprovalQueue(), { role: 'HR' });
    await screen.findByText('MAD 4,800.00');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s4,800\.00 claim/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /someone other than the first approver/i,
    );
  });

  it('reads a 409 as a lost race and refreshes', async () => {
    server.use(
      http.post(APPROVE, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'cannot approve an expense in status REJECTED',
        }),
      ),
    );

    renderWithProviders(secondApprovalQueue(), { role: 'HR' });
    await screen.findByText('MAD 4,800.00');

    await userEvent.click(screen.getByRole('button', { name: /^Approve MAD\s4,800\.00 claim/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/status REJECTED/i);
    expect(alert).toHaveTextContent(/someone else got there first/i);
  });
});

describe('all-claims search (P21)', () => {
  it('spans every state and offers the status filter only here', async () => {
    const { container } = renderWithProviders(searchQueue(), { role: 'HR' });

    expect(await screen.findByText('MAD 249.90')).toBeVisible();
    expect(screen.getByText('MAD 4,800.00')).toBeVisible();
    expect(screen.getByLabelText('Status')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sends the status the user chose', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(SEARCH, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(pageOf([expenseFixture]));
      }),
    );

    renderWithProviders(searchQueue(), { role: 'HR', route: '/hr/expenses?astatus=REJECTED' });
    await screen.findByText('MAD 249.90');

    await waitFor(() => expect(requested?.searchParams.get('status')).toBe('REJECTED'));
    // A browse surface reads newest-first, matching the controller default.
    expect(requested?.searchParams.get('sort')).toBe('createdAt,desc');
  });

  it('offers no decision buttons — it is a record, not a queue', async () => {
    renderWithProviders(searchQueue(), { role: 'HR' });
    await screen.findByText('MAD 249.90');

    expect(screen.queryByRole('button', { name: /^Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reject/i })).not.toBeInTheDocument();
  });

  it('links every row to its claim detail', async () => {
    renderWithProviders(searchQueue(), { role: 'HR' });
    await screen.findByText('MAD 249.90');

    const table = screen.getByRole('table', { name: /all expense claims/i });
    const hrefs = within(table)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      `/expenses/${expenseFixture.id}`,
      `/expenses/${secondApprovalExpenseFixture.id}`,
      `/expenses/${escalatedExpenseFixture.id}`,
    ]);
  });
});

describe('approval threshold (P21)', () => {
  it('shows the current value with its real provenance', async () => {
    const { container } = renderWithProviders(<ThresholdPanel />, { role: 'HR' });

    expect(await screen.findByText('MAD 3,000.00')).toBeVisible();
    // `updatedBy` is a username, rendered as the machine value it is.
    expect(screen.getByText('msw.hr')).toBeVisible();
    expect(screen.getByText('01 Jun 2026, 10:30')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Current setting' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: /change the threshold/i })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('confirms a change and names what it does and does not affect', async () => {
    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');

    const amount = screen.getByLabelText(/threshold amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/MAD 5,000\.00/);
    expect(dialog).toHaveTextContent(/already awaiting a second sign-off stays where it is/i);
    expect(dialog).toHaveTextContent(/written to the audit trail/i);
    // The currency has not changed, so its consequence is not claimed.
    expect(dialog).not.toHaveTextContent(/can no longer be compared/i);
  });

  it('names the currency consequence only when the currency changes', async () => {
    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');

    const currency = screen.getByLabelText(/^currency/i);
    await userEvent.clear(currency);
    await userEvent.type(currency, 'EUR');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Claims held in MAD can no longer be compared/i);
  });

  it('sends the change and reports the value the server returned', async () => {
    let body: { amount: number; currency?: string } | undefined;
    server.use(
      http.put(THRESHOLD, async ({ request }) => {
        body = (await request.json()) as { amount: number; currency?: string };
        return HttpResponse.json({ ...thresholdFixture, amount: 5000 });
      }),
    );

    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');

    const amount = screen.getByLabelText(/threshold amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change threshold' }));

    await waitFor(() => expect(body).toEqual({ amount: 5000, currency: 'MAD' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Claims above MAD 5,000\.00 now need a second approval/i,
    );
  });

  it('validates the amount against the Bean Validation mirror', async () => {
    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');

    const amount = screen.getByLabelText(/threshold amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '-5');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(await screen.findByText(/threshold cannot be negative/i)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('rejects a currency that is not a 3-letter code before sending it', async () => {
    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');

    const currency = screen.getByLabelText(/^currency/i);
    await userEvent.clear(currency);
    await userEvent.type(currency, 'MA');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(await screen.findByText(/^Use a 3-letter ISO-4217 code/i)).toBeVisible();
  });

  it('keeps the confirmation open and reports a refusal where the user clicked', async () => {
    server.use(
      http.put(THRESHOLD, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }),
      ),
    );

    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change threshold' }));

    // The dialog stays open — a refusal reported behind a vanished dialog is a
    // refusal nobody reads — and it carries the correlation id.
    expect(await within(dialog).findByText('Access is denied')).toBeVisible();
    expect(within(dialog).getByText(/corr-test-0001/)).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('maps a 400 field error onto its field', async () => {
    server.use(
      http.put(THRESHOLD, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          errors: { amount: 'numeric value out of bounds' },
        }),
      ),
    );

    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    await screen.findByText('MAD 3,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change threshold' }));

    // Flagged on the field it names, ready for when the dialog is dismissed.
    expect(await screen.findAllByText('numeric value out of bounds')).not.toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: /keep the current/i }));
    expect(screen.getByLabelText(/threshold amount/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not overwrite an edit in progress when the threshold changes elsewhere', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });

    renderWithProviders(<ThresholdPanel />, { role: 'HR', queryClient });
    await screen.findByText('MAD 3,000.00');

    const amount = screen.getByLabelText(/threshold amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '7500');

    // Another admin changes it while this one is typing.
    queryClient.setQueryData(expenseKeys.threshold(), { ...thresholdFixture, amount: 9999 });

    // Their input survives — never wipe what somebody typed.
    await waitFor(() => expect(screen.getByText('MAD 9,999.00')).toBeVisible());
    expect(amount).toHaveValue('7500');
  });

  it('renders a 403 on the threshold read inline', async () => {
    server.use(
      http.get(THRESHOLD, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }),
      ),
    );

    renderWithProviders(<ThresholdPanel />, { role: 'HR' });
    expect(await screen.findByText('Access is denied')).toBeVisible();
  });
});

describe('expense administration page (P21)', () => {
  it('opens on the escalated queue and keeps the tab in the URL', async () => {
    const { container } = renderWithProviders(<ExpenseAdminPage />, { role: 'HR' });

    expect(screen.getByRole('heading', { level: 1, name: 'Expense administration' })).toBeVisible();
    expect(await screen.findByText('MAD 89.50')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('deep-links to the second-approval tab and explains why it holds what it holds', async () => {
    renderWithProviders(<ExpenseAdminPage />, {
      role: 'HR',
      route: '/hr/expenses?view=second-approval',
    });

    expect(await screen.findByText(/these claims are above the threshold/i)).toBeVisible();
    // The context line reads the same cached threshold the Threshold tab does.
    expect(await screen.findByText(/above MAD 3,000\.00/i)).toBeVisible();
    expect(await screen.findByText('MAD 4,800.00')).toBeVisible();
  });

  it('switches to the all-claims tab and says a decided claim is immutable', async () => {
    renderWithProviders(<ExpenseAdminPage />, { role: 'HR' });
    await screen.findByText('MAD 89.50');

    await userEvent.click(screen.getByRole('tab', { name: 'All claims' }));

    expect(await screen.findByText(/every claim, in every state/i)).toBeVisible();
    expect(screen.getByText(/BR-04/)).toBeVisible();
  });

  it('gives each tab its own list state so the queues cannot cross-send parameters', async () => {
    const requests: string[] = [];
    server.use(
      http.get(ESCALATED, ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json(pageOf([escalatedExpenseFixture]));
      }),
      http.get(SECOND, ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json(pageOf([secondApprovalExpenseFixture]));
      }),
    );

    renderWithProviders(<ExpenseAdminPage />, {
      role: 'HR',
      // A category chosen on the escalated tab, in that tab's namespace only.
      route: '/hr/expenses?ecategory=SUPPLIES',
    });
    await screen.findByText('MAD 89.50');
    await userEvent.click(screen.getByRole('tab', { name: 'Second approval' }));
    await screen.findByText('MAD 4,800.00');

    const second = requests.find((url) => url.includes('/second-approval'));
    expect(second).toBeDefined();
    expect(new URL(second!).searchParams.get('category')).toBeNull();
  });
});
