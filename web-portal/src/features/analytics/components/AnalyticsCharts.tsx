import { StatusDonut, type StatusSlice } from '@/shared/components/charts';
import type { AnalyticsDashboardResponse } from '@/shared/types/analytics';

/**
 * The two status breakdowns the analytics payload genuinely supports.
 *
 * Every slice is a field on the record — `submitted`, `approved`, `rejected`,
 * `cancelled`, `pendingSecondApproval`. Nothing is derived, and `total` is
 * deliberately not drawn: it is the sum, and a pie that includes its own total
 * is a chart of nothing.
 *
 * Slices whose value is zero are dropped, because a donut cannot show a
 * zero-width arc and a legend row reading "Rejected 0 (0%)" adds noise rather
 * than information — the KPI cards above already state every figure exactly.
 *
 * Split out of the page and loaded through `React.lazy` so Recharts is fetched
 * only by someone who actually reaches a chart.
 */
export interface AnalyticsChartsProps {
  section: 'leave' | 'expenses';
  data: AnalyticsDashboardResponse;
}

export function AnalyticsCharts({ section, data }: AnalyticsChartsProps) {
  const slices: StatusSlice[] =
    section === 'leave'
      ? [
          { status: 'SUBMITTED', tone: 'info', value: data.leave.submitted },
          { status: 'APPROVED', tone: 'success', value: data.leave.approved },
          { status: 'REJECTED', tone: 'danger', value: data.leave.rejected },
          { status: 'CANCELLED', tone: 'neutral', value: data.leave.cancelled },
        ]
      : [
          { status: 'SUBMITTED', tone: 'info', value: data.expenses.submitted },
          {
            status: 'PENDING_SECOND_APPROVAL',
            tone: 'warning',
            value: data.expenses.pendingSecondApproval,
          },
          { status: 'APPROVED', tone: 'success', value: data.expenses.approved },
          { status: 'REJECTED', tone: 'danger', value: data.expenses.rejected },
          { status: 'CANCELLED', tone: 'neutral', value: data.expenses.cancelled },
        ];

  const present = slices.filter((slice) => slice.value > 0);
  if (present.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <StatusDonut
        title={section === 'leave' ? 'Leave requests by status' : 'Expense claims by status'}
        description="Counts as the service reported them; statuses with no records are omitted."
        valueHeading={section === 'leave' ? 'Requests' : 'Claims'}
        slices={present}
      />
    </div>
  );
}
