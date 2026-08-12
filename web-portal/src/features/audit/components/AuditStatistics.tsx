import { EmptyState, QueryStateBoundary, StatCard } from '@/shared/components';
import { CategoryBarChart, TrendChart, type ChartDatum } from '@/shared/components/charts';
import { Skeleton } from '@/shared/components/ui';
import { ChartNoAxesCombined } from 'lucide-react';

import { useAuditStatisticsQuery } from '../api/audit-api';

/**
 * The Audit Center's statistics band — the last 30 days as the server buckets
 * them.
 *
 * **The window is the server's, not ours.** `AuditController.statistics`
 * defaults to `now - 30 days` when no bounds are given, so the UI sends none
 * and reports the `from`/`to` the response came back with. Computing "30 days"
 * on the client would put two different windows on the same screen the first
 * time the two clocks disagree.
 *
 * **Gaps are gaps.** `AuditQueryService.dailyCounts` emits only the days it
 * found events on, so a quiet Sunday is absent from the array. Nothing here
 * zero-fills it: a zero would be an observation, and the trail made none.
 *
 * `loginAttempts` is bucketed from the platform's own `security_event` history.
 * Keycloak's native login stream (backend P3.6) is not ingested, so the panel
 * names what it is actually counting rather than calling it "logins".
 */
export interface AuditStatisticsProps {
  from: string | undefined;
  to: string | undefined;
}

/** `2026-07-31` → `31 Jul` — dense axis labels for a 30-day window. */
function shortDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function toChartData(rows: { date: string; count: number }[]): ChartDatum[] {
  return rows.map((row) => ({ label: shortDay(row.date), value: row.count }));
}

function total(rows: { count: number }[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export function AuditStatistics({ from, to }: AuditStatisticsProps) {
  const query = useAuditStatisticsQuery(from, to);

  if (query.error) {
    return <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Loading audit statistics</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const stats = query.data;
  const actions = total(stats.actionsPerDay);
  const failures = total(stats.failedActionsPerDay);
  const provisioning = total(stats.provisioningPerDay);
  const offboarding = total(stats.offboardingPerDay);

  if (actions === 0) {
    return (
      <EmptyState
        icon={ChartNoAxesCombined}
        title="No activity in this window"
        description="The trail recorded nothing between these dates. That is an empty window, not a missing one — widen the range to see earlier activity."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Actions recorded"
          value={actions}
          hint="Every entry written to the trail in this window."
        />
        <StatCard
          label="Failed actions"
          value={failures}
          hint="Actions whose code ends in FAILED — the trail's own failure convention."
        />
        <StatCard
          label="Accounts provisioned"
          value={provisioning}
          hint="EMPLOYEE_PROVISIONED entries."
        />
        <StatCard
          label="Employees offboarded"
          value={offboarding}
          hint="EMPLOYEE_OFFBOARDED entries."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TrendChart
          title="Actions per day"
          description="Days with no recorded activity are absent from the series rather than shown as zero."
          labelHeading="Day"
          valueHeading="Actions"
          rows={toChartData(stats.actionsPerDay)}
        />
        <TrendChart
          title="Failed actions per day"
          description="Actions ending in FAILED."
          labelHeading="Day"
          valueHeading="Failures"
          tone="danger"
          rows={toChartData(stats.failedActionsPerDay)}
        />
        <TrendChart
          title="Provisioning per day"
          description="Accounts created by the identity lifecycle."
          labelHeading="Day"
          valueHeading="Provisioned"
          rows={toChartData(stats.provisioningPerDay)}
        />
        <CategoryBarChart
          title="Security events by type"
          description="From the platform's own security-event history — Keycloak's native login stream is not ingested, so this is not a login audit."
          labelHeading="Event type"
          valueHeading="Events"
          rows={stats.loginAttempts.map((row) => ({ label: row.label, value: row.count }))}
        />
      </div>
    </div>
  );
}
