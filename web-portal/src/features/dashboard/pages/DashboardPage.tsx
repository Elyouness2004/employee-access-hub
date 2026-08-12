import { Bell, CalendarDays, ClipboardCheck, Receipt } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { isUnlinkedIdentity } from '@/shared/api';
import { useIdentity, useRoles } from '@/shared/auth';
import {
  Alert,
  PageContainer,
  PageHeader,
  QueryStateBoundary,
  StatCard,
} from '@/shared/components';
import { Button, Skeleton } from '@/shared/components/ui';
import { formatDateRange, formatDays } from '@/shared/lib/format';

// The unread count is `shared/notifications`' — the bell renders the same
// number in the header at the same moment, and two copies of one endpoint drift
// (this tile used to keep the pre-mark-read count while the bell updated).
import { useUnreadCountQuery } from '@/shared/notifications';

import {
  useDashboardBalanceQuery,
  useExpenseQueueCountQuery,
  useLeaveInboxPreviewQuery,
  useMyExpenseCountQuery,
  useMyLeaveCountQuery,
} from '../api/dashboard-api';

/**
 * P04 — Dashboard, role-adaptive (FRONTEND-SPECIFICATION §6).
 *
 * Every figure here answers a question somebody actually has ("do I have days
 * left?", "is anything waiting on me?"), which is the design system's bar for a
 * stat card — a row of numbers without questions behind them is what §12
 * rejects.
 *
 * Each card resolves independently: one failing endpoint degrades one card, not
 * the page. A card that cannot load says so; it never shows a zero, because
 * "unavailable" and "none" are different answers and rendering them the same way
 * is the specific dishonesty §9.4 exists to prevent.
 *
 * The HR/ADMIN governance tier is loaded through `React.lazy`: it is the only
 * part of this route that draws a chart, and this route is eager (it is where
 * everyone lands), so an employee must not download Recharts to see their leave
 * balance.
 */
const GovernanceTier = lazy(() =>
  import('../components/GovernanceTier').then((module) => ({ default: module.GovernanceTier })),
);

export function DashboardPage() {
  const identity = useIdentity();
  const { hasAny } = useRoles();
  const isManager = hasAny('MANAGER');
  const isGovernance = hasAny('HR', 'ADMIN');

  const balance = useDashboardBalanceQuery();
  const pendingLeave = useMyLeaveCountQuery('SUBMITTED');
  const submittedExpenses = useMyExpenseCountQuery('SUBMITTED');
  const secondApproval = useMyExpenseCountQuery('PENDING_SECOND_APPROVAL');
  const unread = useUnreadCountQuery();
  const leaveInbox = useLeaveInboxPreviewQuery(isManager);
  const expenseQueue = useExpenseQueueCountQuery(isManager);

  // An unlinked identity is "no HR record yet", not a failure. leave-service
  // says so with 422 `Employee not eligible`; the card explains it instead of
  // reporting a broken service.
  const balanceUnlinked = isUnlinkedIdentity(balance.error);

  const awaitingMe =
    (leaveInbox.data?.totalElements ?? 0) + (expenseQueue.data?.totalElements ?? 0);

  return (
    <PageContainer>
      <PageHeader
        title={`Welcome, ${identity.displayName}`}
        description="What is waiting on you, and what you have in flight."
      />

      <div className="flex flex-col gap-8">
        {isGovernance ? (
          <Suspense
            fallback={
              <div aria-busy="true">
                <span className="sr-only">Loading the governance summary</span>
                <Skeleton className="h-40 w-full" />
              </div>
            }
          >
            <GovernanceTier />
          </Suspense>
        ) : null}

        {isManager ? (
          <section aria-labelledby="approvals-title" className="flex flex-col gap-4">
            <h2 id="approvals-title" className="text-section-title text-ink-strong">
              Awaiting your approval
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Requests waiting on you"
                icon={ClipboardCheck}
                isLoading={leaveInbox.isPending || expenseQueue.isPending}
                error={leaveInbox.error ?? expenseQueue.error}
                onRetry={() => {
                  void leaveInbox.refetch();
                  void expenseQueue.refetch();
                }}
                value={awaitingMe}
                hint={
                  awaitingMe === 0
                    ? 'Nothing to decide right now.'
                    : `${leaveInbox.data?.totalElements ?? 0} leave · ${expenseQueue.data?.totalElements ?? 0} expenses`
                }
                action={
                  <Button asChild size="compact" variant="secondary">
                    <Link to="/approvals">Open approvals</Link>
                  </Button>
                }
              />
              <div className="rounded-lg border border-border bg-surface p-5">
                <p className="text-label text-ink-muted">Oldest leave requests</p>
                {leaveInbox.isPending ? (
                  <p className="mt-2 text-body text-ink-muted">Loading…</p>
                ) : leaveInbox.error ? (
                  <QueryStateBoundary
                    className="mt-2"
                    error={leaveInbox.error}
                    onRetry={() => void leaveInbox.refetch()}
                  />
                ) : leaveInbox.data && leaveInbox.data.content.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {leaveInbox.data.content.map((request) => (
                      <li key={request.id} className="text-body-secondary text-ink">
                        {formatDays(request.businessDays)} ·{' '}
                        {formatDateRange(request.startDate, request.endDate)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-body text-ink-muted">Nothing awaiting your decision.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="mine-title" className="flex flex-col gap-4">
          <h2 id="mine-title" className="text-section-title text-ink-strong">
            My leave and expenses
          </h2>

          {balanceUnlinked ? (
            <Alert tone="info" title="Your HR record is not linked yet">
              Leave and expenses need an employee record connected to your organization account. HR
              sets this up during onboarding — until then these figures stay empty.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Leave days available"
              icon={CalendarDays}
              isLoading={balance.isPending}
              {...(balanceUnlinked ? {} : { error: balance.error })}
              onRetry={() => void balance.refetch()}
              value={balanceUnlinked ? '—' : (balance.data?.availableDays ?? '—')}
              hint={
                balanceUnlinked
                  ? 'No allocation yet'
                  : balance.data
                    ? `of ${balance.data.totalDays} allocated for ${balance.data.year}`
                    : undefined
              }
              action={
                <Button asChild size="compact" variant="secondary">
                  <Link to="/leave">Request leave</Link>
                </Button>
              }
            />
            <StatCard
              label="Leave awaiting a decision"
              icon={CalendarDays}
              isLoading={pendingLeave.isPending}
              error={pendingLeave.error}
              onRetry={() => void pendingLeave.refetch()}
              value={pendingLeave.data ?? 0}
              hint="Requests you have submitted that nobody has decided yet."
            />
            <StatCard
              label="Expenses awaiting a decision"
              icon={Receipt}
              isLoading={submittedExpenses.isPending}
              error={submittedExpenses.error}
              onRetry={() => void submittedExpenses.refetch()}
              value={submittedExpenses.data ?? 0}
              hint="Claims your manager has not decided yet."
            />
            {/*
              Counted separately from SUBMITTED and never added to it: these
              have been approved once and are waiting for HR sign-off (BR-03).
            */}
            <StatCard
              label="Expenses awaiting HR sign-off"
              icon={Receipt}
              isLoading={secondApproval.isPending}
              error={secondApproval.error}
              onRetry={() => void secondApproval.refetch()}
              value={secondApproval.data ?? 0}
              hint="Approved by your manager; above the threshold, so HR signs them off."
              action={
                <Button asChild size="compact" variant="secondary">
                  <Link to="/expenses">View expenses</Link>
                </Button>
              }
            />
          </div>
        </section>

        <section aria-labelledby="notifications-title" className="flex flex-col gap-4">
          <h2 id="notifications-title" className="text-section-title text-ink-strong">
            Notifications
          </h2>
          <StatCard
            className="sm:max-w-dialog-md"
            label="Unread notifications"
            icon={Bell}
            isLoading={unread.isPending}
            error={unread.error}
            onRetry={() => void unread.refetch()}
            value={unread.data ?? 0}
            hint="Lifecycle and security events raised for your account."
          />
        </section>
      </div>
    </PageContainer>
  );
}
