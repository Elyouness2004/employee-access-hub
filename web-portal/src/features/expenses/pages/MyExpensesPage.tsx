import type { ColumnDef } from '@tanstack/react-table';
import { Receipt, SearchX } from 'lucide-react';
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
import { formatDate, formatMoney } from '@/shared/lib/format';
import type { ExpenseResponse } from '@/shared/types/expenses';

import {
  EXPENSE_DEFAULT_SORT,
  useCancelExpenseMutation,
  useMyExpensesQuery,
} from '../api/expenses-api';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../labels';

const STATUS_OPTIONS = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PENDING_SECOND_APPROVAL', label: 'Pending second approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

const FILTER_KEYS = ['status', 'category', 'from', 'to'] as const;

/**
 * P07 — My expenses.
 *
 * `PENDING_SECOND_APPROVAL` gets its own amber badge and its own explanation,
 * because to the claimant it looks like an approval that has not paid out. It is
 * not: a manager approved it, the amount was above the company threshold, and
 * HR still has to sign it off (BR-03) — and can still reject it.
 *
 * Cancellation is offered only on `SUBMITTED`: once a first approval has moved
 * a claim to `PENDING_SECOND_APPROVAL` the owner can no longer withdraw it
 * (`Expense.cancel` throws, the API answers 409).
 */
export function MyExpensesPage() {
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
  } = useUrlFilters({ keys: FILTER_KEYS, defaultSort: EXPENSE_DEFAULT_SORT });

  const query = useMyExpensesQuery({
    page,
    sort,
    search,
    status: filters.status,
    category: filters.category,
    from: filters.from,
    to: filters.to,
  });
  const cancel = useCancelExpenseMutation();
  const confirmation = useConfirmation();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<ExpenseResponse | null>(null);

  const doCancel = async () => {
    if (!pendingCancel) return;
    try {
      await cancel.mutateAsync(pendingCancel.id);
      confirmation.close();
      setPendingCancel(null);
    } catch (error) {
      confirmation.setError(messageFor(error));
    }
  };

  const columns = useMemo<ColumnDef<ExpenseResponse, unknown>[]>(
    () => [
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
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        cell: ({ row }) => (
          <span className="flex flex-col gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.status === 'PENDING_SECOND_APPROVAL' ? (
              <span className="text-caption text-ink-muted">
                Above the threshold — awaiting HR sign-off
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'detail',
        header: 'Details',
        meta: { hideBelowLg: true },
        cell: ({ row }) => (
          <Link
            to={`/expenses/${row.original.id}`}
            aria-label={`View the ${formatMoney(row.original.amount, row.original.currency)} claim from ${formatDate(row.original.expenseDate)}`}
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
        title="My expenses"
        description="Claims you have submitted and where each one stands."
        actions={<Button onClick={() => setFormOpen(true)}>Submit claim</Button>}
      />

      <div className="flex flex-col gap-4">
        <FilterBar onClear={clearFilters} isFiltered={isFiltered}>
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search your expense claims"
            placeholder="Search descriptions"
          />
          <FilterSelect
            label="Status"
            anyLabel="Any status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Category"
            anyLabel="Any category"
            value={filters.category}
            onChange={(value) => setFilter('category', value)}
            options={CATEGORY_OPTIONS}
          />
          {/* from/to bound the EXPENSE DATE, not the submission time. */}
          <FilterDate
            label="Spent from"
            value={filters.from}
            onChange={(value) => setFilter('from', value)}
          />
          <FilterDate
            label="Spent to"
            value={filters.to}
            onChange={(value) => setFilter('to', value)}
          />
        </FilterBar>

        <DataTable
          caption="Your expense claims"
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
              icon={Receipt}
              title="No expense claims yet"
              description="Submit a claim and it appears here with its status. Your manager decides it, and larger amounts also need HR sign-off."
              action={<Button onClick={() => setFormOpen(true)}>Submit claim</Button>}
            />
          }
          noMatchesState={
            <EmptyState
              icon={SearchX}
              title="No claims match these filters"
              description="You do have expense claims — none match what you have narrowed it to."
            />
          }
          rowActions={(row) =>
            row.status === 'SUBMITTED' ? (
              <Button
                size="compact"
                variant="secondary"
                aria-label={`Cancel your ${formatMoney(row.amount, row.currency)} claim from ${formatDate(row.expenseDate)}`}
                onClick={() => {
                  setPendingCancel(row);
                  confirmation.ask();
                }}
              >
                Cancel claim
              </Button>
            ) : null
          }
        />
      </div>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={confirmation.onOpenChange}
        title="Cancel this expense claim?"
        description={
          pendingCancel
            ? `Your ${formatMoney(pendingCancel.amount, pendingCancel.currency)} claim from ${formatDate(pendingCancel.expenseDate)} will be withdrawn.`
            : ''
        }
        consequences={[
          'It disappears from your manager’s queue and will not be reimbursed.',
          'Cancelling is final — submit a new claim if you still need to.',
        ]}
        confirmLabel="Cancel claim"
        cancelLabel="Keep claim"
        destructive
        busy={cancel.isPending}
        error={confirmation.error}
        onConfirm={() => void doCancel()}
      />
    </PageContainer>
  );
}
