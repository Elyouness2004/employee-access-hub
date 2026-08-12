import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Alert,
  AlertSlot,
  ApprovalActions,
  DataTable,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  SearchField,
  StatusBadge,
  statusLabel,
} from '@/shared/components';
import { AppLink } from '@/shared/components/ui';
import { useIdentity } from '@/shared/auth';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDateRange, formatDays } from '@/shared/lib/format';
import { PersonCell, usePeopleLookupRef } from '@/shared/people';
import { BALANCE_TRACKED_LEAVE_TYPES, type LeaveRequestResponse } from '@/shared/types/leave';

import {
  LEAVE_ESCALATED_DEFAULT_SORT,
  LEAVE_TEXT_MAX,
  useEscalatedLeaveQuery,
  useLeaveDecisionMutation,
} from '../api/leave-api';
import { LEAVE_TYPE_LABELS } from '../labels';

const TYPE_OPTIONS = [
  { value: 'ANNUAL', label: LEAVE_TYPE_LABELS.ANNUAL },
  { value: 'SICK', label: LEAVE_TYPE_LABELS.SICK },
  { value: 'UNPAID', label: LEAVE_TYPE_LABELS.UNPAID },
] as const;

/** Prefixed so the two P20 tabs can share one URL without colliding. */
const FILTER_KEYS = ['etype', 'efrom', 'eto'] as const;

/**
 * P20 — the HR escalation queue.
 *
 * `GET /api/leave/requests/escalated` is `hasAnyRole('HR','ADMIN')` and its
 * scope is pinned in SQL to `hrEscalated = true AND status = SUBMITTED`
 * (`LeaveRequestSpecifications.escalated`). Two consequences the UI has to
 * respect rather than paper over:
 *
 *  - **There is no status filter**, because every row is pending. Offering one
 *    would suggest this queue can show decided requests; it cannot.
 *  - **This is not a global leave list.** HR has no endpoint that returns every
 *    request — only own, addressed-to-me and escalated. The panel says so, and
 *    links each row to the detail page, which HR *is* allowed to read by id.
 *
 * BR-02 also forbids deciding one's own request, including down the escalation
 * path (`LeaveRequest.approve` → `requireNotSelf`). An HR user who is
 * self-managed lands their own request in this very queue, so the row states
 * that the server will refuse it instead of offering a click that can only 422.
 */
export function EscalatedLeavePanel() {
  const { subject } = useIdentity();
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
  } = useUrlFilters({
    keys: FILTER_KEYS,
    defaultSort: LEAVE_ESCALATED_DEFAULT_SORT,
    namespace: 'e',
  });

  const query = useEscalatedLeaveQuery({
    page,
    sort,
    search,
    type: filters.etype,
    from: filters.efrom,
    to: filters.eto,
  });
  const decide = useLeaveDecisionMutation();
  // One resolve for the page of rows — leave-service holds no names (§2.5).
  const people = usePeopleLookupRef({
    keycloakIds: query.data?.content.map((row) => row.employeeKeycloakId),
  });
  // A decision that closes its dialog and says nothing has told the operator
  // only that the dialog closed. The expense queue reports its outcome; so does
  // this one, in the same polite region, from the status the SERVER returned.
  const [outcome, setOutcome] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<LeaveRequestResponse, unknown>[]>(
    () => [
      {
        id: 'employee',
        header: 'Requested by',
        // leave-service stores Keycloak subjects and does not join the HR
        // directory for this projection; the shared people resolver supplies
        // the name, and the identifier stays visible when it cannot.
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
        cell: ({ row }) => LEAVE_TYPE_LABELS[row.original.type] ?? row.original.type,
      },
      {
        id: 'period',
        header: 'Period',
        cell: ({ row }) => (
          <AppLink to={`/leave/${row.original.id}`}>
            {formatDateRange(row.original.startDate, row.original.endDate)}
          </AppLink>
        ),
      },
      {
        id: 'businessDays',
        header: 'Working days',
        meta: { sortKey: 'businessDays', align: 'right', priority: true },
        cell: ({ row }) => formatDays(row.original.businessDays),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        // Every row is SUBMITTED and escalated. The pair of badges is still
        // worth its width: it is what tells an HR user WHY this request is
        // theirs to decide rather than a manager's.
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} />
            <StatusBadge status="HR_ESCALATED" />
          </div>
        ),
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
      <AlertSlot>
        {outcome ? (
          <Alert tone="info" live={false} title="Decision recorded">
            {outcome}
          </Alert>
        ) : null}
      </AlertSlot>

      <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
        <SearchField
          value={search}
          onChange={setSearch}
          label="Search escalated leave requests"
          placeholder="Search reasons"
        />
        <FilterSelect
          label="Type"
          anyLabel="Any type"
          value={filters.etype}
          onChange={(value) => setFilter('etype', value)}
          options={TYPE_OPTIONS}
        />
        <FilterDate
          label="Period from"
          value={filters.efrom}
          onChange={(value) => setFilter('efrom', value)}
        />
        <FilterDate
          label="Period to"
          value={filters.eto}
          onChange={(value) => setFilter('eto', value)}
        />
      </FilterBar>

      <DataTable
        caption="Leave requests escalated to HR"
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
            title="Nothing escalated to HR"
            description="A request lands here when the requester has no manager who can decide it (BR-02). There is nothing waiting."
          />
        }
        noMatchesState={
          <EmptyState
            icon={SearchX}
            title="No escalated requests match these filters"
            description="The queue is not empty — nothing matches what you have narrowed it to."
          />
        }
        rowActions={(row) => {
          const own = row.employeeKeycloakId === subject;
          const refusal = own ? 'You cannot decide your own leave request (BR-02).' : undefined;
          return (
            <ApprovalActions
              subject={
                <>
                  {formatDays(row.businessDays)} of {row.type.toLowerCase()} leave,{' '}
                  {formatDateRange(row.startDate, row.endDate)}. It reached HR because no manager
                  could decide it.
                  {BALANCE_TRACKED_LEAVE_TYPES.includes(row.type)
                    ? ' Approving debits the requester’s annual balance immediately.'
                    : ' This type does not draw on the annual balance.'}
                </>
              }
              rowLabel={`${formatDays(row.businessDays)} of ${row.type.toLowerCase()} leave, ${formatDateRange(row.startDate, row.endDate)}`}
              commentMaxLength={LEAVE_TEXT_MAX}
              busy={decide.isPending}
              onDialogOpen={() => setOutcome(null)}
              onConflict={() => void query.refetch()}
              {...(refusal ? { approveRefusedReason: refusal, rejectRefusedReason: refusal } : {})}
              onDecide={async (decision, comment) => {
                const updated = await decide.mutateAsync({
                  id: row.id,
                  decision,
                  ...(comment ? { comment } : {}),
                });
                const what = `${formatDays(updated.businessDays)} of ${updated.type.toLowerCase()} leave, ${formatDateRange(updated.startDate, updated.endDate)}`;
                setOutcome(
                  updated.status === 'APPROVED'
                    ? `Approved ${what}.${
                        BALANCE_TRACKED_LEAVE_TYPES.includes(updated.type)
                          ? ' The requester’s annual balance has been debited.'
                          : ''
                      }`
                    : updated.status === 'REJECTED'
                      ? `Rejected ${what}.`
                      : // The server is the authority on the resulting state;
                        // if it is neither, say which one it is rather than
                        // assuming the decision we asked for.
                        `${what} is now ${statusLabel(updated.status).toLowerCase()}.`,
                );
              }}
            />
          );
        }}
      />
    </div>
  );
}
