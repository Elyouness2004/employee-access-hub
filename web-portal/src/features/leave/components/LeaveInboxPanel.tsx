import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, SearchX } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import {
  ApprovalActions,
  DataTable,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  SearchField,
} from '@/shared/components';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateRange, formatDays } from '@/shared/lib/format';
import { PersonCell, usePeopleLookupRef } from '@/shared/people';
import { BALANCE_TRACKED_LEAVE_TYPES, type LeaveRequestResponse } from '@/shared/types/leave';

import {
  LEAVE_INBOX_DEFAULT_SORT,
  LEAVE_TEXT_MAX,
  useLeaveDecisionMutation,
  useLeaveInboxQuery,
} from '../api/leave-api';

const TYPE_OPTIONS = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'UNPAID', label: 'Unpaid' },
] as const;

/** Prefixed so leave and expense filters can share one URL (P14 has both tabs). */
const FILTER_KEYS = ['ltype', 'lfrom', 'lto'] as const;

/**
 * The leave half of the manager approvals inbox (P14).
 *
 * `GET /api/leave/requests/inbox` is annotated `hasRole('MANAGER')` and scoped
 * to requests ADDRESSED to the caller — the snapshotted manager, not the current
 * org chart. So the queue never needs a status filter (everything in it is
 * pending) and never accepts a manager parameter (there is nothing to pass).
 *
 * It lives in the leave feature and is exported for composition, rather than
 * being reimplemented next to the expense queue: the leave decision mutation,
 * its cache keys and its balance invalidation all belong here.
 */
export interface LeaveInboxPanelProps {
  /**
   * Reports the queue's total to whoever composes the tabs. The count belongs
   * on the tab label (FRONTEND-SPECIFICATION P14), and the panel is the only
   * thing that already has it — a second count query would be a second request
   * that can disagree with the first.
   */
  onTotalChange?: (total: number) => void;
}

export function LeaveInboxPanel({ onTotalChange }: LeaveInboxPanelProps = {}) {
  const {
    page,
    sort,
    search,
    filters,
    setPage,
    setSort,
    setSearch,
    setFilter,
    clearFilters,
    isFiltered,
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: LEAVE_INBOX_DEFAULT_SORT });

  const query = useLeaveInboxQuery({
    page,
    sort,
    search,
    type: filters.ltype,
    from: filters.lfrom,
    to: filters.lto,
  });
  const decide = useLeaveDecisionMutation();
  // One resolve for the whole page of rows: the leave service holds no names
  // (§2.5), so "who asked for this" is a lookup, not a field on the row.
  const people = usePeopleLookupRef({
    keycloakIds: query.data?.content.map((row) => row.employeeKeycloakId),
  });

  const total = query.data?.totalElements;
  useEffect(() => {
    if (total !== undefined) onTotalChange?.(total);
  }, [onTotalChange, total]);

  const columns = useMemo<ColumnDef<LeaveRequestResponse, unknown>[]>(
    () => [
      {
        id: 'employee',
        header: 'Requested by',
        // The row itself carries only a Keycloak subject — the leave service
        // stores no names and does not join the HR directory for this
        // projection. The shared people resolver supplies the name; when it
        // cannot, the identifier is still shown rather than a guess.
        cell: ({ row }) => (
          <PersonCell
            resolution={people.current.byKeycloakId(row.original.employeeKeycloakId)}
            fallback={row.original.employeeKeycloakId}
          />
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { sortKey: 'type', priority: true },
        cell: ({ row }) =>
          TYPE_OPTIONS.find((o) => o.value === row.original.type)?.label ?? row.original.type,
      },
      {
        id: 'period',
        header: 'Period',
        cell: ({ row }) => formatDateRange(row.original.startDate, row.original.endDate),
      },
      {
        id: 'businessDays',
        header: 'Working days',
        meta: { sortKey: 'businessDays', align: 'right', priority: true },
        cell: ({ row }) => formatDays(row.original.businessDays),
      },
      {
        id: 'reason',
        header: 'Reason',
        meta: { hideBelowLg: true },
        cell: ({ row }) => row.original.reason ?? '—',
      },
    ],
    [people],
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
        <SearchField
          value={search}
          onChange={setSearch}
          label="Search pending leave requests"
          placeholder="Search reasons"
        />
        <FilterSelect
          label="Type"
          anyLabel="Any type"
          value={filters.ltype}
          onChange={(value) => setFilter('ltype', value)}
          options={TYPE_OPTIONS}
        />
        <FilterDate
          label="Period from"
          value={filters.lfrom}
          onChange={(value) => setFilter('lfrom', value)}
        />
        <FilterDate
          label="Period to"
          value={filters.lto}
          onChange={(value) => setFilter('lto', value)}
        />
      </FilterBar>

      <DataTable
        caption="Leave requests awaiting your decision"
        columns={columns}
        page={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        label="requests"
        isFiltered={isFiltered}
        rowId={(row) => row.id}
        cardTitle={(row) => formatDateRange(row.startDate, row.endDate)}
        emptyState={
          <EmptyState
            icon={CalendarCheck}
            title="Nothing awaiting your approval"
            description="Leave requests from your direct reports land here. There is nothing to do right now."
          />
        }
        noMatchesState={
          <EmptyState
            icon={SearchX}
            title="No pending requests match these filters"
            description="Your inbox is not empty — nothing matches what you have narrowed it to."
          />
        }
        rowActions={(row) => (
          <ApprovalActions
            subject={
              <>
                {formatDays(row.businessDays)} of {row.type.toLowerCase()} leave,{' '}
                {formatDateRange(row.startDate, row.endDate)}.
                {/* Only ANNUAL draws on the tracked balance (BR-01); the service
                    debits nothing for the others, and promising a debit that
                    will not happen is not a named consequence. */}
                {BALANCE_TRACKED_LEAVE_TYPES.includes(row.type)
                  ? ' Approving debits the requester’s annual balance immediately.'
                  : ' This type does not draw on the annual balance.'}
              </>
            }
            rowLabel={`${formatDays(row.businessDays)} of ${row.type.toLowerCase()} leave, ${formatDateRange(row.startDate, row.endDate)}`}
            commentMaxLength={LEAVE_TEXT_MAX}
            busy={decide.isPending}
            onConflict={() => void query.refetch()}
            onDecide={async (decision, comment) => {
              await decide.mutateAsync({
                id: row.id,
                decision,
                ...(comment ? { comment } : {}),
              });
            }}
          />
        )}
      />
    </div>
  );
}
