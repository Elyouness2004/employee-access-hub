/**
 * The chart set (DESIGN-SYSTEM §2.5), isolated in its own module so Recharts
 * lands in **one** chunk that only the surfaces needing a chart pull in.
 *
 * The analytics and Audit Center routes are lazy, so importing from here is
 * already deferred to those routes. The dashboard is the exception: it is the
 * eager landing route, so its governance tier imports this module through
 * `React.lazy` — an eager import there would put the whole charting library in
 * the boot bundle for an employee who never sees a chart.
 */
export { ChartFrame } from './ChartFrame';
export type { ChartDatum, ChartFrameProps } from './ChartFrame';
export { TrendChart } from './TrendChart';
export type { TrendChartProps } from './TrendChart';
export { StatusDonut } from './StatusDonut';
export type { StatusDonutProps, StatusSlice } from './StatusDonut';
export { CategoryBarChart } from './CategoryBarChart';
export type { CategoryBarChartProps } from './CategoryBarChart';
