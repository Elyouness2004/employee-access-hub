import type { ColumnDef } from '@tanstack/react-table';
import { ReceiptText, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
} from '@/shared/components';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDate, formatMoney } from '@/shared/lib/format';
import { PersonCell, usePeopleLookupRef } from '@/shared/people';
import type { ExpenseResponse } from '@/shared/types/expenses';

import {
  EXPENSE_PENDING_DEFAULT_SORT,
  EXPENSE_TEXT_MAX,
  useExpenseDecisionMutation,
  useExpenseQueueQuery,
} from '../api/expenses-api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../labels';

/** Prefixed so the leave and expense tabs of P14 can share one URL. */
const FILTER_KEYS = ['xcategory', 'xfrom', 'xto'] as const;

/**
 * The expense half of the manager approvals inbox (P14).
 *
 * The outcome of an approval is NOT knowable before the server answers: below
 * the company threshold it finalises the claim, above it the claim moves to
 * `PENDING_SECOND_APPROVAL` for HR (BR-03). The threshold is HR-readable only,
 * so this client cannot predict which happens — and must not guess.
 *
 * So the confirmation says the approval "may need a second sign-off", and the
 * result banner reports the status the SERVER returned. Telling a manager they
 * approved a claim that is actually still pending would be a lie the manager
 * would repeat to the claimant.
 */
export interface ExpenseQueuePanelProps {
  /**
   * Reports the queue's total to whoever composes the tabs. The count belongs
   * on the tab label (FRONTEND-SPECIFICATION P14), and the panel is the only
   * thing that already has it — a second count query would be a second request
   * that can disagree with the first.
   */
  onTotalChange?: (total: number) => void;
}

export function ExpenseQueuePanel({ onTotalChange }: ExpenseQueuePanelProps = {}) {
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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: EXPENSE_PENDING_DEFAULT_SORT });

  const query = useExpenseQueueQuery({
    page,
    sort,
    search,
    category: filters.xcategory,
    from: filters.xfrom,
    to: filters.xto,
  });
  const decide = useExpenseDecisionMutation();
  // One resolve for the page of rows — expense-service holds no names (§2.5).
  const people = usePeopleLookupRef({
    keycloakIds: query.data?.content.map((row) => row.employeeKeycloakId),
  });
  const [outcome, setOutcome] = useState<string | null>(null);

  const total = query.data?.totalElements;
  useEffect(() => {
    if (total !== undefined) onTotalChange?.(total);
  }, [onTotalChange, total]);

  const columns = useMemo<ColumnDef<ExpenseResponse, unknown>[]>(
    () => [
      {
        id: 'employee',
        header: 'Claimed by',
        // The expense service stores keycloak ids and joins no directory for
        // this projection; the shared people resolver names them, and the
        // identifier stays visible when it cannot.
        cell: ({ row }) => (
          <PersonCell
            resolution={people.current.byKeycloakId(row.original.employeeKeycloakId)}
            fallback={row.original.employeeKeycloakId}
          />
        ),
      },
      {
        id: 'expenseDate',
        header: 'Date',
        meta: { sortKey: 'expenseDate', priority: true },
        cell: ({ row }) => formatDate(row.original.expenseDate),
      },
      {
        id: 'category',
        header: 'Category',
        meta: { sortKey: 'category', priority: true },
        cell: ({ row }) => CATEGORY_LABELS[row.original.category] ?? row.original.category,
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.amount, row.original.currency),
      },
      {
        id: 'description',
        header: 'Description',
        meta: { hideBelowLg: true },
        cell: ({ row }) => row.original.description ?? '—',
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
          label="Search pending expense claims"
          placeholder="Search descriptions"
        />
        <FilterSelect
          label="Category"
          anyLabel="Any category"
          value={filters.xcategory}
          onChange={(value) => setFilter('xcategory', value)}
          options={CATEGORY_OPTIONS}
        />
        <FilterDate
          label="Spent from"
          value={filters.xfrom}
          onChange={(value) => setFilter('xfrom', value)}
        />
        <FilterDate
          label="Spent to"
          value={filters.xto}
          onChange={(value) => setFilter('xto', value)}
        />
      </FilterBar>

      <DataTable
        caption="Expense claims awaiting your decision"
        columns={columns}
        page={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        label="claims"
        isFiltered={isFiltered}
        rowId={(row) => row.id}
        cardTitle={(row) => formatMoney(row.amount, row.currency)}
        emptyState={
          <EmptyState
            icon={ReceiptText}
            title="Nothing awaiting your approval"
            description="Expense claims from your direct reports land here. There is nothing to do right now."
          />
        }
        noMatchesState={
          <EmptyState
            icon={SearchX}
            title="No pending claims match these filters"
            description="Your queue is not empty — nothing matches what you have narrowed it to."
          />
        }
        rowActions={(row) => (
          <ApprovalActions
            subject={
              <>
                {formatMoney(row.amount, row.currency)} for{' '}
                {(CATEGORY_LABELS[row.category] ?? row.category).toLowerCase()}, spent{' '}
                {formatDate(row.expenseDate)}. Above the company threshold, approving sends it for a
                second sign-off by HR rather than finalising it.
              </>
            }
            rowLabel={`${formatMoney(row.amount, row.currency)} claim from ${formatDate(row.expenseDate)}`}
            commentMaxLength={EXPENSE_TEXT_MAX}
            busy={decide.isPending}
            onDialogOpen={() => setOutcome(null)}
            onConflict={() => void query.refetch()}
            onDecide={async (decision, comment) => {
              const updated = await decide.mutateAsync({
                id: row.id,
                decision,
                ...(comment ? { comment } : {}),
              });
              // Report the status the SERVER chose, never the one we assumed.
              setOutcome(
                updated.status === 'PENDING_SECOND_APPROVAL'
                  ? `${formatMoney(updated.amount, updated.currency)} sent for second-level approval — it is above the threshold, so HR signs it off before it is final.`
                  : updated.status === 'APPROVED'
                    ? `${formatMoney(updated.amount, updated.currency)} approved.`
                    : `${formatMoney(updated.amount, updated.currency)} rejected.`,
              );
            }}
          />
        )}
      />
    </div>
  );
}
