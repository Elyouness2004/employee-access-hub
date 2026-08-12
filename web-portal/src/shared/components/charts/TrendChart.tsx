import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame, type ChartDatum, type ChartFrameProps } from './ChartFrame';

/**
 * A count over time (audit actions per day, the dashboard activity sparkline).
 *
 * Monochrome by default (DESIGN-SYSTEM §2.5: charts are monochrome-first;
 * saturation appears only when a series encodes a status), so a trend line
 * carries no accidental "good/bad" reading — a busy day is not a bad day.
 * `tone="danger"` is reserved for the series that genuinely does encode one:
 * failed actions.
 *
 * The series is drawn exactly as the server bucketed it. Days with no events
 * are absent from `AuditStatisticsResponse`, and they are left absent here:
 * inserting zeros would be inventing observations the trail does not contain.
 */

export interface TrendChartProps extends Omit<ChartFrameProps, 'children' | 'rows'> {
  rows: ChartDatum[];
  tone?: 'neutral' | 'danger';
  /** Compact variant: no axes or grid, for an in-card sparkline. */
  sparkline?: boolean;
}

export function TrendChart({
  rows,
  tone = 'neutral',
  sparkline = false,
  height = sparkline ? 72 : 200,
  ...frame
}: TrendChartProps) {
  const color = tone === 'danger' ? 'var(--status-danger-text)' : 'var(--chart-1)';
  const gradientId = `trend-${tone}-${sparkline ? 'spark' : 'full'}`;

  return (
    <ChartFrame {...frame} rows={rows} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {sparkline ? null : (
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          )}
          {sparkline ? null : (
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              stroke="var(--chart-grid)"
              tickLine={false}
              minTickGap={24}
            />
          )}
          {sparkline ? null : (
            <YAxis
              allowDecimals={false}
              width={32}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              stroke="var(--chart-grid)"
              tickLine={false}
            />
          )}
          {sparkline ? null : (
            <Tooltip
              contentStyle={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-strong)',
                fontSize: 13,
              }}
              cursor={{ stroke: 'var(--border-strong)' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name={frame.valueHeading}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            // Motion is for state changes, not decoration (DESIGN-SYSTEM §7).
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
