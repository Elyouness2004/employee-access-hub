import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { messageFor } from '@/shared/api';
import {
  ConfirmActionDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  PageContainer,
  PageHeader,
  SearchField,
  StatusBadge,
  useConfirmation,
} from '@/shared/components';
import { Button } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateRange, formatDays } from '@/shared/lib/format';
import type { LeaveRequestResponse } from '@/shared/types/leave';

import {
  LEAVE_DEFAULT_SORT,
  useCancelLeaveMutation,
  useMyBalanceQuery,
  useMyLeaveQuery,
} from '../api/leave-api';
import { LeaveBalanceMeter } from '../components/LeaveBalanceMeter';
import { LeaveRequestDialog } from '../components/LeaveRequestDialog';

const STATUS_OPTIONS = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

const TYPE_OPTIONS = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'UNPAID', label: 'Unpaid' },
] as const;

const FILTER_KEYS = ['status', 'type', 'from', 'to'] as const;

/**
 * P05 — My leave. The balance, the request list, and the two actions an owner
 * has: submit, and cancel while still pending.
 *
 * Cancellation is offered ONLY on `SUBMITTED`, because that is the only state
 * the domain allows an owner to leave (`LeaveRequest.cancel` throws otherwise
 * and the API answers 409). Showing the control on a decided request and
 * letting the server refuse would be an invitation to fail.
 */
export function MyLeavePage() {
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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: LEAVE_DEFAULT_SORT });

  const query = useMyLeaveQuery({
    page,
    sort,
    search,
    status: filters.status,
    type: filters.type,
    from: filters.from,
    to: filters.to,
  });
  const balance = useMyBalanceQuery();
  const cancel = useCancelLeaveMutation();
  const confirmation = useConfirmation();
  const [requestOpen, setRequestOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<LeaveRequestResponse | null>(null);

  const askCancel = (request: LeaveRequestResponse) => {
    setPendingCancel(request);
    confirmation.ask();
  };

  const doCancel = async () => {
    if (!pendingCancel) return;
    try {
      await cancel.mutateAsync(pendingCancel.id);
      confirmation.close();
      setPendingCancel(null);
    } catch (error) {
      // 409 here means it was decided while the dialog was open — the server's
      // message says so, and the row refreshes underneath.
      confirmation.setError(messageFor(error));
    }
  };

  const columns = useMemo<ColumnDef<LeaveRequestResponse, unknown>[]>(
    () => [
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
        // Server-computed: rendered, never recalculated.
        cell: ({ row }) => formatDays(row.original.businessDays),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.hrEscalated ? <StatusBadge status="HR_ESCALATED" /> : null}
          </span>
        ),
      },
      {
        id: 'detail',
        header: 'Details',
        meta: { hideBelowLg: true },
        cell: ({ row }) => (
          <Link
            to={`/leave/${row.original.id}`}
            aria-label={`View the request for ${formatDateRange(row.original.startDate, row.original.endDate)}`}
            className="text-body-secondary"
          >
            View
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="My leave"
        description="Your requests and your annual balance."
        actions={<Button onClick={() => setRequestOpen(true)}>Request leave</Button>}
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="balance-title">
          <h2 id="balance-title" className="mb-4 text-section-title text-ink-strong">
            Annual balance
          </h2>
          <LeaveBalanceMeter
            balance={balance.data}
            isLoading={balance.isPending}
            error={balance.error}
            onRetry={() => void balance.refetch()}
          />
        </section>

        <section aria-labelledby="requests-title" className="flex flex-col gap-4">
          <h2 id="requests-title" className="text-section-title text-ink-strong">
            Requests
          </h2>

          <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
            <SearchField
              value={search}
              onChange={setSearch}
              label="Search your leave requests"
              placeholder="Search reasons"
            />
            <FilterSelect
              label="Status"
              anyLabel="Any status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Type"
              anyLabel="Any type"
              value={filters.type}
              onChange={(value) => setFilter('type', value)}
              options={TYPE_OPTIONS}
            />
            {/* from/to bound the leave PERIOD, not when it was submitted. */}
            <FilterDate
              label="Period from"
              value={filters.from}
              onChange={(value) => setFilter('from', value)}
            />
            <FilterDate
              label="Period to"
              value={filters.to}
              onChange={(value) => setFilter('to', value)}
            />
          </FilterBar>

          <DataTable
            caption="Your leave requests"
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
                icon={CalendarDays}
                title="No leave requests yet"
                description="When you request leave it appears here with its status, and your manager receives it for a decision."
                action={<Button onClick={() => setRequestOpen(true)}>Request leave</Button>}
              />
            }
            noMatchesState={
              <EmptyState
                icon={SearchX}
                title="No requests match these filters"
                description="You do have leave requests — none match what you have narrowed it to."
              />
            }
            rowActions={(row) =>
              row.status === 'SUBMITTED' ? (
                <Button
                  size="compact"
                  variant="secondary"
                  aria-label={`Cancel your leave request for ${formatDateRange(row.startDate, row.endDate)}`}
                  onClick={() => askCancel(row)}
                >
                  Cancel request
                </Button>
              ) : null
            }
          />
        </section>
      </div>

      <LeaveRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        {...(balance.data ? { availableDays: balance.data.availableDays } : {})}
      />

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={confirmation.onOpenChange}
        title="Cancel this leave request?"
        description={
          pendingCancel
            ? `Your ${pendingCancel.businessDays}-working-day request for ${formatDateRange(pendingCancel.startDate, pendingCancel.endDate)} will be withdrawn.`
            : ''
        }
        consequences={[
          'Your manager no longer sees it in their approvals inbox.',
          'Cancelling is final — submit a new request if you still need the time off.',
        ]}
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        destructive
        busy={cancel.isPending}
        error={confirmation.error}
        onConfirm={() => void doCancel()}
      />
    </PageContainer>
  );
}
