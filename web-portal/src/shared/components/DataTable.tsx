import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactNode } from 'react';

import type { PageResponse } from '@/shared/api';
import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { MEDIA, useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/cn';

import { PaginationControls } from './PaginationControls';
import { QueryStateBoundary } from './QueryStateBoundary';

/**
 * The server-driven table (DESIGN-SYSTEM §9.1). Every collection endpoint in
 * the platform is paged, so this component never sorts, filters or slices data
 * itself — `manualPagination` and `manualSorting` are on, and what it receives
 * is what it shows. Client-side paging over a page would be a lie about how much
 * data exists.
 *
 * Three things it refuses to blur:
 *
 *  - **"No records match" is not "no records exist"**, and neither is an error.
 *    The caller passes both empty states and whether a filter is active.
 *  - **Sort affordances appear only on whitelisted columns** (`meta.sortKey`).
 *    The API silently drops an unknown sort, so an unsortable header that looks
 *    sortable would read as a bug the user cannot report.
 *  - **Below `md` the table becomes cards**, not a horizontal scroll. Tables
 *    never scroll the page sideways (FRONTEND-SPECIFICATION §7).
 *
 * Semantics: a `<caption>`, `scope="col"` headers, `aria-sort` on the active
 * column, and a polite live region announcing the result count after a filter
 * or sort change.
 */

declare module '@tanstack/react-table' {
  // The library declares both parameters; this app uses neither, but the
  // signature has to match for the augmentation to apply.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Server sort property. Present = the column is genuinely sortable. */
    sortKey?: string;
    /**
     * Include this column in the card transform below `md`. Cards show
     * PRIORITY fields only (FRONTEND-SPECIFICATION §7) — a phone must not end
     * up with more fields than a tablet.
     */
    priority?: boolean;
    /** Numbers and amounts sit right, in tabular figures. */
    align?: 'right';
    /** Dropped on tablets to keep the priority columns readable. */
    hideBelowLg?: boolean;
  }
}

export interface DataTableProps<T> {
  /** Names the table for assistive tech; visually hidden when the page title says it. */
  caption: string;
  columns: ColumnDef<T, unknown>[];
  page: PageResponse<T> | undefined;
  isLoading: boolean;
  /** True during a background refetch while previous data is still on screen. */
  isFetching?: boolean;
  error: unknown;
  onRetry?: () => void;
  /** Current `property,asc|desc`, or undefined for the endpoint default. */
  sort: string | undefined;
  onSortChange: (sort: string | undefined) => void;
  onPageChange: (page: number) => void;
  /** Plural noun for counts ("requests"). */
  label: string;
  /** Nothing exists yet — usually a positive, actionable state. */
  emptyState: ReactNode;
  /** Records exist, but not for these filters. */
  noMatchesState: ReactNode;
  isFiltered: boolean;
  /** Stable row key; the backend id, never an index. */
  rowId: (row: T) => string;
  /** Card heading below `md`; the table's most identifying value. */
  cardTitle: (row: T) => ReactNode;
  rowActions?: (row: T) => ReactNode;
}

function parseSort(sort: string | undefined): { key: string; desc: boolean } | null {
  if (!sort) return null;
  const [key, direction] = sort.split(',');
  return key ? { key, desc: direction === 'desc' } : null;
}

export function DataTable<T>({
  caption,
  columns,
  page,
  isLoading,
  isFetching = false,
  error,
  onRetry,
  sort,
  onSortChange,
  onPageChange,
  label,
  emptyState,
  noMatchesState,
  isFiltered,
  rowId,
  cardTitle,
  rowActions,
}: DataTableProps<T>) {
  const active = parseSort(sort);
  // ONE tree, chosen by the effective breakpoint — not both trees with one
  // hidden by CSS. Rendering both would duplicate every value in the DOM,
  // double what a text search or a copy-paste picks up, and double the work on
  // exactly the devices least able to afford it.
  const isTable = useMediaQuery(MEDIA.mdUp);
  const table = useReactTable({
    data: page?.content ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => rowId(row),
  });

  if (error) return <QueryStateBoundary error={error} {...(onRetry ? { onRetry } : {})} />;

  if (isLoading && !page) return <TableSkeleton columns={columns.length} caption={caption} />;

  if (page && page.totalElements === 0) {
    return <>{isFiltered ? noMatchesState : emptyState}</>;
  }
  if (!page) return null;

  const rows = table.getRowModel().rows;

  // Records exist, but not on THIS page index — usually a stale deep link or a
  // page number carried over from a longer list. Neither empty state fits: the
  // honest answer is that the page is out of range, with a way back.
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-panel-title text-ink-strong">That page is empty</p>
        <p className="mt-1 text-body text-ink-muted">
          There are {page.totalElements} {label} in total, but none on page {page.page + 1}.
        </p>
        <button
          type="button"
          className="mt-3 text-label text-link underline"
          onClick={() => onPageChange(0)}
        >
          Go to the first page
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {isTable ? (
        /* Desktop and tablet: a real table. */
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border-strong">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sortKey = meta?.sortKey;
                  const isActive = Boolean(sortKey) && active?.key === sortKey;
                  const isDescending = isActive && active !== null && active.desc;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={isActive ? (isDescending ? 'descending' : 'ascending') : undefined}
                      className={cn(
                        'px-3 py-2 text-left text-table-header text-ink-muted',
                        meta?.align === 'right' && 'text-right',
                        meta?.hideBelowLg && 'hidden lg:table-cell',
                      )}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-table-header text-ink-muted hover:text-ink-strong"
                          onClick={() =>
                            onSortChange(
                              isActive && !isDescending ? `${sortKey},desc` : `${sortKey},asc`,
                            )
                          }
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isActive ? (
                            isDescending ? (
                              <ArrowDown aria-hidden="true" className="size-4" />
                            ) : (
                              <ArrowUp aria-hidden="true" className="size-4" />
                            )
                          ) : (
                            <ArrowUpDown aria-hidden="true" className="size-4 text-ink-disabled" />
                          )}
                          <VisuallyHidden>
                            {isActive && !isDescending ? ', sort descending' : ', sort ascending'}
                          </VisuallyHidden>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
                {rowActions ? (
                  <th scope="col" className="px-3 py-2 text-right text-table-header text-ink-muted">
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody aria-busy={isLoading || isFetching || undefined}>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-surface-hover"
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2 align-middle text-body-secondary text-ink',
                        meta?.align === 'right' && 'text-right tabular-nums',
                        meta?.hideBelowLg && 'hidden lg:table-cell',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
                {rowActions ? (
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">{rowActions(row.original)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* Below md: priority fields as cards. No horizontal page scroll, ever. */
        <ul>
          {rows.map((row) => (
            <MobileCard
              key={row.id}
              row={row}
              title={cardTitle(row.original)}
              actions={rowActions?.(row.original)}
            />
          ))}
        </ul>
      )}

      <PaginationControls page={page} onPageChange={onPageChange} label={label} />
    </div>
  );
}

function MobileCard<T>({
  row,
  title,
  actions,
}: {
  row: Row<T>;
  title: ReactNode;
  actions: ReactNode;
}) {
  // PRIORITY ONLY. Opt-in, not opt-out: a column that nobody thought about
  // stays off the phone, which is the safe direction.
  const cells = row
    .getVisibleCells()
    .filter((cell) => cell.column.columnDef.meta?.priority === true);
  return (
    <li className="border-b border-border p-4 last:border-0">
      <p className="text-panel-title text-ink-strong">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {cells.map((cell) => (
          <div key={cell.id} className="min-w-0">
            <dt className="text-caption text-ink-muted">{headerLabel(cell.column.columnDef)}</dt>
            <dd className="mt-0.5 text-body-secondary text-ink">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </dd>
          </div>
        ))}
      </dl>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}

/**
 * The header text for the card transform. Column headers are plain strings in
 * this app; anything else falls back to the column id rather than rendering a
 * header component outside its header context.
 */
function headerLabel<T>(column: ColumnDef<T, unknown>): string {
  return typeof column.header === 'string' ? column.header : (column.id ?? '');
}

/** Layout-shaped placeholder — never a spinner, never a blank panel. */
export function TableSkeleton({ columns, caption }: { columns: number; caption: string }) {
  return (
    <div aria-busy="true" className="rounded-lg border border-border bg-surface p-4">
      <VisuallyHidden>Loading {caption}</VisuallyHidden>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, rowIndex) => (
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
