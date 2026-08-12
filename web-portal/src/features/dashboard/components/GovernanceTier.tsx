import { FileText, ScrollText, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert, AvailabilityGuard, QueryStateBoundary, StatCard } from '@/shared/components';
import { TrendChart } from '@/shared/components/charts';
import { Button, Skeleton } from '@/shared/components/ui';
import { formatDateTime } from '@/shared/lib/format';

import {
  useAuditActivityQuery,
  useGovernanceAnalyticsQuery,
  useProvisioningFailureCountQuery,
} from '../api/dashboard-api';

/**
 * The HR/ADMIN dashboard tier (FRONTEND-SPECIFICATION §6).
 *
 * Loaded through `React.lazy` from the dashboard page: this is the only part of
 * the landing route that draws a chart, and Recharts must not sit in the boot
 * bundle of an employee who will never see one.
 *
 * **The alerts are ranked, and the ranking is the design.** §6 puts provisioning
 * failures first (danger) and failed-action trend second (warning), because a
 * failed provisioning means somebody has an HR record and no working account —
 * the platform's central promise, unfulfilled — while a failed action is a
 * signal to investigate. Both link to the surface that answers "which ones".
 *
 * Every figure sits behind its own availability or error branch. An unreachable
 * analytics source shows the unavailable panel, never the zeros the payload
 * actually carries.
 */
export function GovernanceTier() {
  const analytics = useGovernanceAnalyticsQuery(true);
  const audit = useAuditActivityQuery(true);
  const provisioningFailures = useProvisioningFailureCountQuery(true);

  const failedActions = (audit.data?.failedActionsPerDay ?? []).reduce(
    (sum, day) => sum + day.count,
    0,
  );
  const activityRows = (audit.data?.actionsPerDay ?? []).map((day) => ({
    label: day.date,
    value: day.count,
  }));

  return (
    <section aria-labelledby="governance-title" className="flex flex-col gap-4">
      <h2 id="governance-title" className="text-section-title text-ink-strong">
        Platform governance
      </h2>

      {/* Rank 1 — danger. A record with no working account. */}
      {provisioningFailures.data && provisioningFailures.data > 0 ? (
        <Alert
          tone="danger"
          title={`${provisioningFailures.data} employee record${provisioningFailures.data === 1 ? '' : 's'} failed to provision`}
          actions={
            <Button asChild size="compact" variant="secondary">
              <Link to="/hr/employees?provisioningStatus=FAILED">Review them</Link>
            </Button>
          }
        >
          <p>
            Keycloak rejected the account creation, so these people have an HR record and no way to
            sign in. Re-provisioning from the employee&apos;s Identity tab retries it.
          </p>
        </Alert>
      ) : null}

      {/* Rank 2 — warning. Something is failing; the trail knows what. */}
      {failedActions > 0 ? (
        <Alert
          tone="warning"
          title={`${failedActions} failed action${failedActions === 1 ? '' : 's'} in the last 30 days`}
          actions={
            <Button asChild size="compact" variant="secondary">
              <Link to="/hr/audit?result=FAILURE">Open the trail</Link>
            </Button>
          }
        >
          <p>
            Actions whose code ends in FAILED. The Audit Center shows which ones, who attempted them
            and what the service said.
          </p>
        </Alert>
      ) : null}

      <AvailabilityGuard
        available={analytics.data?.employees.available}
        isLoading={analytics.isPending}
        error={analytics.error}
        onRetry={() => void analytics.refetch()}
        source="hr-service"
        title="Workforce KPIs"
      >
        {analytics.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Employee records"
              icon={Users}
              value={analytics.data.employees.totalEmployees}
              hint="Every record HR holds, at any status."
              action={
                <Button asChild size="compact" variant="secondary">
                  <Link to="/hr/employees">Open the directory</Link>
                </Button>
              }
            />
            <StatCard
              label="Active accounts"
              value={analytics.data.employees.activeEmployees}
              hint="Records whose status keeps a login account enabled."
            />
            <StatCard
              label="Provisioning failures"
              icon={ShieldAlert}
              isLoading={provisioningFailures.isPending}
              error={provisioningFailures.error}
              onRetry={() => void provisioningFailures.refetch()}
              value={provisioningFailures.data ?? '—'}
              hint="Employee records whose account creation was rejected."
            />
            <StatCard
              label="Failed actions (30 days)"
              icon={TriangleAlert}
              isLoading={audit.isPending}
              error={audit.error}
              onRetry={() => void audit.refetch()}
              value={failedActions}
              hint="From the audit trail's own failure convention."
            />
          </div>
        ) : null}
      </AvailabilityGuard>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          {audit.error ? (
            <QueryStateBoundary error={audit.error} onRetry={() => void audit.refetch()} />
          ) : audit.isPending ? (
            <div aria-busy="true">
              <span className="sr-only">Loading audit activity</span>
              <Skeleton className="h-20 w-full" />
            </div>
          ) : activityRows.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-panel-title text-ink-strong">Audit activity</p>
              <p className="text-body text-ink-muted">
                Nothing was recorded in the last 30 days. An empty window is not a missing one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-panel-title text-ink-strong">Audit activity</p>
                  <p className="text-body-secondary text-ink-muted">
                    Actions recorded per day over the last 30 days.
                  </p>
                </div>
                <Button asChild size="compact" variant="secondary">
                  <Link to="/hr/audit">
                    <ScrollText aria-hidden="true" />
                    Audit Center
                  </Link>
                </Button>
              </div>
              <TrendChart
                sparkline
                hideTitle
                title="Audit activity"
                description="Actions recorded per day over the last 30 days."
                labelHeading="Day"
                valueHeading="Actions"
                rows={activityRows}
              />
            </div>
          )}
        </div>

        <AvailabilityGuard
          available={analytics.data?.documents.available}
          isLoading={analytics.isPending}
          error={analytics.error}
          onRetry={() => void analytics.refetch()}
          source="documents-service"
          title="Document KPIs"
        >
          {analytics.data ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Documents stored"
                icon={FileText}
                value={analytics.data.documents.totalDocuments}
                hint="Records in the library, including metadata-only entries."
              />
              <StatCard
                label="Sensitive documents"
                value={analytics.data.documents.sensitiveDocuments}
                hint="Filed under an HR or admin category."
              />
            </div>
          ) : null}
        </AvailabilityGuard>
      </div>

      {analytics.data ? (
        <p className="text-caption text-ink-muted">
          Analytics collected{' '}
          <span className="font-mono tabular-nums">
            {formatDateTime(analytics.data.generatedAt)}
          </span>
          . These are cached snapshots, not live counts —{' '}
          <Link to="/analytics" className="text-link underline">
            the analytics page
          </Link>{' '}
          has the full breakdown.
        </p>
      ) : null}
    </section>
  );
}
