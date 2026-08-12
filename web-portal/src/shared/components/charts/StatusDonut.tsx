import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { statusLabel, type StatusTone } from '@/shared/components/StatusBadge';

import { ChartFrame, type ChartFrameProps } from './ChartFrame';

/**
 * A status breakdown (leave requests by state, expense claims by state).
 *
 * The slice colours come from the `--status-*` **text** tones, which is what
 * `StatusBadge` renders — so a chart and the badges in the table beneath it
 * cannot disagree about what amber means (DESIGN-SYSTEM §2.5). The caller
 * passes the domain status literal, not a colour: picking a colour is exactly
 * the decision the status map exists to take away from feature code.
 *
 * Colour is never the only channel: the legend beside the donut names every
 * slice with its count, and the frame's hidden table repeats them.
 */

const TONE_VAR: Record<StatusTone, string> = {
  success: 'var(--status-success-text)',
  warning: 'var(--status-warning-text)',
  danger: 'var(--status-danger-text)',
  info: 'var(--status-info-text)',
  neutral: 'var(--status-neutral-text)',
};

export interface StatusSlice {
  /** Backend status literal (`SUBMITTED`) — labelled and toned through the status map. */
  status: string;
  tone: StatusTone;
  value: number;
}

export interface StatusDonutProps extends Omit<
  ChartFrameProps,
  'children' | 'rows' | 'labelHeading' | 'valueHeading'
> {
  slices: StatusSlice[];
  /** Column heading for the value column ("Requests"). */
  valueHeading: string;
}

export function StatusDonut({ slices, valueHeading, height = 200, ...frame }: StatusDonutProps) {
  const rows = slices.map((slice) => ({ label: statusLabel(slice.status), value: slice.value }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ChartFrame
        {...frame}
        rows={rows}
        labelHeading="Status"
        valueHeading={valueHeading}
        height={height}
        className="min-w-0 flex-1"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="status"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={1}
              isAnimationActive={false}
              stroke="var(--surface)"
              strokeWidth={1}
            >
              {slices.map((slice) => (
                <Cell key={slice.status} fill={TONE_VAR[slice.tone]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-strong)',
                fontSize: 13,
              }}
              formatter={(value: number, name: string) => [value, statusLabel(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>

      {/* The legend is the visible alternative: every slice named, counted and
          shown as a share, so nothing here depends on telling two colours
          apart. */}
      <dl className="flex min-w-0 flex-col gap-2 sm:w-48">
        {slices.map((slice) => (
          <div key={slice.status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: TONE_VAR[slice.tone] }}
            />
            <dt className="min-w-0 flex-1 truncate text-body-secondary text-ink">
              {statusLabel(slice.status)}
            </dt>
            <dd className="tabular-nums text-body-secondary text-ink-strong">
              {slice.value}
              <span className="ml-1 text-caption text-ink-muted">
                {total > 0 ? `(${Math.round((slice.value / total) * 100)}%)` : '(—)'}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
