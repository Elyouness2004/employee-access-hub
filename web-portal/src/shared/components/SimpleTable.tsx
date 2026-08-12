import type { ReactNode } from 'react';

import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { MEDIA, useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/cn';

import { QueryStateBoundary } from './QueryStateBoundary';

/**
 * The UNPAGED sibling of `DataTable` (DESIGN-SYSTEM §9.1).
 *
 * A handful of the platform's read surfaces are deliberately not collections:
 * the per-employee provisioning and security-event histories are bounded by one
 * employee, and a person's session list comes from Keycloak. api-conventions §1
 * names them explicitly, and the rules forbid faking pagination over them — so
 * they need a table that never offers a page control or a sort affordance the
 * server would silently drop.
 *
 * It is intentionally not built on TanStack Table: with no sorting, paging,
 * selection or column model to manage, the library would add a row model and a
 * dependency to render a `<table>`. `DataTable` owns every server-driven list
 * and is where TanStack Table earns its place.
 *
 * What it does share with `DataTable`, because a second table look would be a
 * design-system defect: the bordered surface, `<caption>` + `scope="col"`
 * semantics, layout-shaped skeletons, one error decision through
 * `QueryStateBoundary`, and the card transform below `md` so no page ever
 * scrolls sideways.
 */

export interface SimpleColumn<T> {
  /** Column heading; also the field label in the card transform. */
  header: string;
  cell: (row: T) => ReactNode;
  /** Machine data — ids, codes, precise timestamps (DESIGN-SYSTEM §3). */
  mono?: boolean;
  align?: 'right';
  /** Dropped on tablets to keep the remaining columns readable. */
  hideBelowLg?: boolean;
  /** Shown in the card transform below `md`. Opt-in, like `DataTable`. */
  priority?: boolean;
}

export interface SimpleTableProps<T> {
  /** Names the table for assistive tech. */
  caption: string;
  columns: SimpleColumn<T>[];
  rows: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  rowId: (row: T) => string;
  /** Card heading below `md`; the row's most identifying value. */
  cardTitle: (row: T) => ReactNode;
  /** Nothing recorded yet — usually a neutral fact, not a failure. */
  emptyState: ReactNode;
  /** Rendered instead of the generic error when the server answered 404. */
  notFound?: ReactNode;
}

export function SimpleTable<T>({
  caption,
  columns,
  rows,
  isLoading,
  error,
  onRetry,
  rowId,
  cardTitle,
  emptyState,
  notFound,
}: SimpleTableProps<T>) {
  const isTable = useMediaQuery(MEDIA.mdUp);

  if (error) {
    return (
      <QueryStateBoundary
        error={error}
        {...(onRetry ? { onRetry } : {})}
        {...(notFound ? { notFound } : {})}
      />
    );
  }
  if (isLoading && !rows) return <SimpleTableSkeleton columns={columns.length} caption={caption} />;
  if (!rows) return null;
  if (rows.length === 0) return <>{emptyState}</>;

  const cardColumns = columns.filter((column) => column.priority);

  return (
    <div className="rounded-lg border border-border bg-surface">
      {isTable ? (
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-strong">
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-left text-table-header text-ink-muted',
                    column.align === 'right' && 'text-right',
                    column.hideBelowLg && 'hidden lg:table-cell',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowId(row)} className="border-b border-border last:border-0">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={cn(
                      'px-3 py-2 align-top text-body-secondary text-ink',
                      column.mono && 'font-mono text-mono-sm',
                      column.align === 'right' && 'text-right tabular-nums',
                      column.hideBelowLg && 'hidden lg:table-cell',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={rowId(row)} className="border-b border-border p-4 last:border-0">
              <p className="text-panel-title text-ink-strong">{cardTitle(row)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                {cardColumns.map((column) => (
                  <div key={column.header} className="min-w-0">
                    <dt className="text-caption text-ink-muted">{column.header}</dt>
                    <dd
                      className={cn(
                        'mt-0.5 break-words text-ink',
                        column.mono ? 'font-mono text-mono-sm' : 'text-body-secondary',
                      )}
                    >
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Layout-shaped placeholder — never a spinner, never a blank panel. */
export function SimpleTableSkeleton({ columns, caption }: { columns: number; caption: string }) {
  return (
    <div aria-busy="true" className="rounded-lg border border-border bg-surface p-4">
      <VisuallyHidden>Loading {caption}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-3">
            {Array.from({ length: columns }, (_, cellIndex) => (
              <Skeleton key={cellIndex} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
