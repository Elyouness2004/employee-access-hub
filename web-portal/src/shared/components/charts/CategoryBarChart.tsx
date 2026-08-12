import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartFrame, type ChartDatum, type ChartFrameProps } from './ChartFrame';

/**
 * Counts across a labelled dimension (security-event types, document
 * categories) — horizontal bars, because these labels are words rather than
 * dates and a vertical axis reads them without rotation.
 *
 * One graphite series (DESIGN-SYSTEM §2.5): the categories are a breakdown, not
 * a set of judgements, so nothing here should read as good or bad.
 */

export interface CategoryBarChartProps extends Omit<ChartFrameProps, 'children' | 'rows'> {
  rows: ChartDatum[];
}

export function CategoryBarChart({ rows, height, ...frame }: CategoryBarChartProps) {
  // A row needs vertical room; the height follows the data rather than being a
  // fixed box that crowds six bars and wastes space on two.
  const resolvedHeight = height ?? Math.max(120, rows.length * 32 + 24);

  return (
    <ChartFrame {...frame} rows={rows} height={resolvedHeight}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            stroke="var(--chart-grid)"
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            stroke="var(--chart-grid)"
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-strong)',
              fontSize: 13,
            }}
            cursor={{ fill: 'var(--surface-hover)' }}
          />
          <Bar
            dataKey="value"
            name={frame.valueHeading}
            fill="var(--chart-1)"
            isAnimationActive={false}
            radius={[0, 4, 4, 0]}
            barSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
