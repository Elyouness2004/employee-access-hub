import { FileText, RefreshCw, Users, Wallet } from 'lucide-react';
import { lazy, Suspense } from 'react';

import {
  AvailabilityGuard,
  PageContainer,
  PageHeader,
  QueryStateBoundary,
  StatCard,
} from '@/shared/components';
import { Button, Skeleton } from '@/shared/components/ui';
import { formatDateTime, formatMoney } from '@/shared/lib/format';

import { useAnalyticsDashboardQuery } from '../api/analytics-api';

/**
 * P24 — Analytics (`/analytics`). HR + ADMIN.
 *
 * Four sections, one per source, each degrading on its own. The whole design of
 * this page is the `available` flag:
 *
 *  - a section that reports `available: false` renders the **Data unavailable**
 *    panel and **no figure at all**. The payload does carry numbers in that
 *    case — every `*Summary.unavailable()` factory fills them with zero — and
 *    printing them would report "0 employees" for an hr-service that is merely
 *    unreachable. That is the single most consequential lie this page could
 *    tell, so the guard renders the children only when the flag is true;
 *  - a real zero still shows as 0, because a measured zero is information;
 *  - one unreachable source never blanks the others: the request succeeded, and
 *    the sections that answered are as good as they ever were.
 *
 * `generatedAt` is stamped by the server when it assembled the composite, and
 * it is shown because these are snapshots behind a cache, not live reads —
 * "as of 09:45" is a materially different claim from "right now".
 *
 * There are no charts beyond what the endpoints return, and no metric that is
 * not a field on a record: nothing here is derived, projected or trended,
 * because the API exposes no history to trend.
 */

const AnalyticsCharts = lazy(() =>
  import('../components/AnalyticsCharts').then((module) => ({ default: module.AnalyticsCharts })),
);

export function AnalyticsPage() {
  const query = useAnalyticsDashboardQuery();
  const data = query.data;

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description="Aggregates collected from each service. Every section reports its own availability — an unreachable source shows as unavailable, never as zero."
        actions={
          <Button
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {query.error ? (
        <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="flex flex-col gap-8">
          <p className="text-body-secondary text-ink-muted" aria-live="polite">
            {data ? (
              <>
                Collected{' '}
                <span className="font-mono tabular-nums">{formatDateTime(data.generatedAt)}</span>.
                These are cached snapshots, not live counts.
              </>
            ) : (
              'Collecting the latest snapshot.'
            )}
          </p>

          <section className="flex flex-col gap-3">
            <h2 className="text-section-title text-ink-strong">Workforce</h2>
            <AvailabilityGuard
              available={data?.employees.available}
              isLoading={query.isPending}
              source="hr-service"
              title="Workforce KPIs"
            >
              {data ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Employee records"
                    value={data.employees.totalEmployees}
                    hint="Every record HR holds, at any status."
                    icon={Users}
                  />
                  <StatCard
                    label="Active"
                    value={data.employees.activeEmployees}
                    hint="Records whose status keeps a login account enabled."
                  />
                  <StatCard
                    label="Disabled"
                    value={data.employees.disabledEmployees}
                    hint="Records whose account has been switched off."
                  />
                  <StatCard
                    label="Departments and positions"
                    value={`${data.employees.departments} / ${data.employees.positions}`}
                    hint="Catalogue entries employees are assigned from."
                  />
                </div>
              ) : null}
            </AvailabilityGuard>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-section-title text-ink-strong">Leave</h2>
            <AvailabilityGuard
              available={data?.leave.available}
              isLoading={query.isPending}
              source="leave-service"
              title="Leave KPIs"
            >
              {data ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Requests recorded"
                      value={data.leave.total}
                      hint="Every leave request, at any status."
                    />
                    <StatCard
                      label="Awaiting a decision"
                      value={data.leave.submitted}
                      hint="Submitted and not yet approved or rejected."
                    />
                    <StatCard label="Approved" value={data.leave.approved} hint="Granted leave." />
                    <StatCard
                      label="Rejected"
                      value={data.leave.rejected}
                      hint="Declined by a manager or by HR."
                    />
                  </div>
                  <Suspense fallback={<ChartSkeleton label="leave status chart" />}>
                    <AnalyticsCharts section="leave" data={data} />
                  </Suspense>
                </div>
              ) : null}
            </AvailabilityGuard>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-section-title text-ink-strong">Expenses</h2>
            <AvailabilityGuard
              available={data?.expenses.available}
              isLoading={query.isPending}
              source="expense-service"
              title="Expense KPIs"
            >
              {data ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Claims recorded"
                      value={data.expenses.total}
                      hint="Every expense claim, at any status."
                      icon={Wallet}
                    />
                    <StatCard
                      label="Awaiting a manager"
                      value={data.expenses.submitted}
                      hint="Submitted and not yet decided."
                    />
                    <StatCard
                      label="Awaiting second approval"
                      value={data.expenses.pendingSecondApproval}
                      // Never folded into "approved": a manager cleared these,
                      // HR has not, and they can still be rejected (BR-03).
                      hint="Approved once, above the threshold, waiting on HR."
                    />
                    <StatCard
                      label="Approved spend"
                      value={
                        data.expenses.currency
                          ? formatMoney(data.expenses.approvedAmount, data.expenses.currency)
                          : // The record allows a null currency; an amount
                            // without one is not money we can name.
                            `${data.expenses.approvedAmount} (currency not reported)`
                      }
                      hint="Total of approved claims, as the expense service recorded them."
                    />
                  </div>
                  <Suspense fallback={<ChartSkeleton label="expense status chart" />}>
                    <AnalyticsCharts section="expenses" data={data} />
                  </Suspense>
                </div>
              ) : null}
            </AvailabilityGuard>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-section-title text-ink-strong">Documents</h2>
            <AvailabilityGuard
              available={data?.documents.available}
              isLoading={query.isPending}
              source="documents-service"
              title="Document KPIs"
            >
              {data ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Documents stored"
                    value={data.documents.totalDocuments}
                    hint="Records in the library, including metadata-only entries."
                    icon={FileText}
                  />
                  <StatCard
                    label="Sensitive"
                    value={data.documents.sensitiveDocuments}
                    hint="Filed under an HR or admin category."
                  />
                  <StatCard
                    label="Categories"
                    value={data.documents.totalCategories}
                    hint="Access tiers documents can be filed into."
                  />
                  <StatCard
                    label="Downloads recorded"
                    value={data.documents.downloadsLogged}
                    hint="DOCUMENT_DOWNLOADED entries in the documents audit trail."
                  />
                </div>
              ) : null}
            </AvailabilityGuard>
          </section>
        </div>
      )}
    </PageContainer>
  );
}

function ChartSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading the {label}</span>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
