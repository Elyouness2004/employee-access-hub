import { type ReactNode } from 'react';

import { VisuallyHidden } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

/**
 * The frame every chart in the product sits in — and, more importantly, the
 * place its accessible alternative is guaranteed.
 *
 * DESIGN-SYSTEM §10 and the accessibility rules both require a table or summary
 * alternative for every chart, and a chart's SVG is unreadable to a screen
 * reader and unreachable by keyboard. Rather than trusting each chart to
 * remember, the frame renders the data table itself from the same rows the
 * chart was given: an alternative cannot drift from the chart when it is
 * derived from the identical array.
 *
 * The table is visually hidden rather than absent, and the graphic is
 * `aria-hidden`, so assistive tech encounters exactly one representation of the
 * data — the readable one.
 */

export interface ChartDatum {
  /** X-axis / slice label. */
  label: string;
  value: number;
}

export interface ChartFrameProps {
  /** Names the chart; also the table `<caption>`. */
  title: string;
  /** What the numbers are counted over — one line, under the title. */
  description?: string;
  /** Column heading for the label column ("Day", "Status"). */
  labelHeading: string;
  /** Column heading for the value column ("Events"). */
  valueHeading: string;
  rows: ChartDatum[];
  /** Chart height in px — fixed so the skeleton and the chart agree. */
  height?: number;
  children: ReactNode;
  className?: string;
  /** Show the title above the chart; off when the surrounding panel names it. */
  hideTitle?: boolean;
}

export function ChartFrame({
  title,
  description,
  labelHeading,
  valueHeading,
  rows,
  height = 200,
  children,
  className,
  hideTitle,
}: ChartFrameProps) {
  return (
    <figure className={cn('m-0 flex flex-col gap-2', className)}>
      {hideTitle ? null : (
        <figcaption>
          <span className="text-panel-title text-ink-strong">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-body-secondary text-ink-muted">{description}</span>
          ) : null}
        </figcaption>
      )}
      {/* The graphic is decoration for assistive tech: the table below carries
          the same numbers in a form that can actually be read and navigated. */}
      <div aria-hidden="true" style={{ height }} className="w-full">
        {children}
      </div>
      <VisuallyHidden>
        <table>
          <caption>{description ? `${title} — ${description}` : title}</caption>
          <thead>
            <tr>
              <th scope="col">{labelHeading}</th>
              <th scope="col">{valueHeading}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </figure>
  );
}
