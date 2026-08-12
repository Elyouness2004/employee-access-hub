import type { ColumnDef } from '@tanstack/react-table';
import { ReceiptText, SearchX } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

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
} from '@/shared/components';
import { AppLink, Input } from '@/shared/components/ui';
import { useIdentity } from '@/shared/auth';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import { formatDate, formatMoney } from '@/shared/lib/format';
import { PersonCell, usePeopleLookupRef } from '@/shared/people';
import type { ExpenseResponse } from '@/shared/types/expenses';

import {
  EXPENSE_TEXT_MAX,
  useExpenseAdminQuery,
  useExpenseDecisionMutation,
  useThresholdQuery,
  type ExpenseAdminScope,
} from '../api/expenses-api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, STATUS_OPTIONS } from '../labels';

/**
 * P21 — one queue component for the three HR/ADMIN collections.
 *
 * `escalated`, `second-approval` and `search` return the same DTO with the same
 * filters and the same sort whitelist; only the server-pinned scope differs
 * (`ExpenseSpecifications`). Rendering them from one component is what keeps a
 * claim from looking decided in one tab and pending in another.
 *
 * What each scope is allowed to offer:
 *
 *  - **status filter — `search` only.** The two queues pin their status in SQL,
 *    so a status control there would be ignored by the server while looking
 *    applied here.
 *  - **decisions — the two queues only.** `search` spans terminal claims, and
 *    `IllegalExpenseStateException` (409, BR-04) is what a decision on one
 *    answers. It is a browse surface; every row links to its detail page.
 *
 * Two refusals are stated on the row rather than discovered by clicking, both
 * as affordances over rules the SERVER still owns:
 *  - **BR-02** — nobody decides their own claim (`Expense.requireNotSelf`).
 *  - **BR-03** — the second approver must not be the first
 *    (`Expense.secondApproval`). It refuses only the APPROVAL: the first
 *    approver may still reject, which is why the two reasons are separate.
 */
export interface ExpenseAdminQueueProps {
  scope: ExpenseAdminScope;
  /** Prefix for this tab's URL state, so three tabs can share one query string. */
  namespace: string;
  /** Table caption and the noun in the counts. */
  caption: string;
  emptyTitle: string;
  emptyDescription: string;
}

/** Only `search` is a browse surface; the other two exist to be decided. */
function decidable(scope: ExpenseAdminScope): boolean {
  return scope !== 'search';
}

/**
 * What THIS click will do to THIS claim, said before it is clicked.
 *
 * A first-level approval is not one action: at or below the threshold it
 * APPROVES the claim outright, and BR-04 makes that terminal — there is no undo.
 * Above it, the claim moves to a second sign-off and is not final. Naming only
 * the second case (as the manager queue must, since the threshold is HR-readable
 * only and it would be guessing) would tell an HR user their irreversible
 * approval is reversible.
 *
 * Here the threshold IS readable, so the row says which of the two it is. Two
 * cases where it still cannot: the threshold has not loaded, and the claim is
 * held in a different currency — `Money.isGreaterThan` refuses to compare two
 * currencies, so the server answers 422 rather than deciding anything.
 */
function approvalConsequence(
  scope: ExpenseAdminScope,
  claim: ExpenseResponse,
  threshold: { amount: number; currency: string } | undefined,
): string {
  if (scope === 'second-approval') {
    return 'This is the second-level sign-off — approving finalises the claim, and a decided claim cannot be changed (BR-04).';
  }
  if (!threshold) {
    return 'Above the company threshold, approving sends it for a second sign-off; at or below it, approving finalises the claim.';
  }
  if (threshold.currency.toUpperCase() !== claim.currency.toUpperCase()) {
    return `This claim is in ${claim.currency} and the threshold is set in ${threshold.currency}. The two cannot be compared, so the server will refuse this approval until the currencies match.`;
  }
  return claim.amount > threshold.amount
    ? `At ${formatMoney(claim.amount, claim.currency)} this is above the ${formatMoney(threshold.amount, threshold.currency)} threshold, so approving sends it for a second sign-off by a different HR or Admin user — it is not final yet.`
    : `At ${formatMoney(claim.amount, claim.currency)} this is at or below the ${formatMoney(threshold.amount, threshold.currency)} threshold, so approving finalises it now. A decided claim cannot be changed (BR-04).`;
}

export function ExpenseAdminQueue({
  scope,
  namespace,
  caption,
  emptyTitle,
  emptyDescription,
}: ExpenseAdminQueueProps) {
  const { subject } = useIdentity();
  const minId = useId();
  const maxId = useId();
  const keys = useMemo(
    () => [
      `${namespace}category`,
      `${namespace}from`,
      `${namespace}to`,
      `${namespace}min`,
      `${namespace}max`,
      // `status` is registered ONLY where it is offered and sent. Registering it
      // everywhere made `isFiltered` count a parameter the queues never pass, so
      // a stale `?estatus=` in the URL swapped the honest "Nothing escalated to
      // HR" for "No claims match these filters" — a filter the server never
      // applied, hiding an empty queue behind an imaginary one.
      ...(scope === 'search' ? [`${namespace}status`] : []),
    ],
    [namespace, scope],
  );

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
  } = useUrlFilters({ keys, namespace });

  const params = {
    page,
    sort,
    search,
    category: filters[`${namespace}category`],
    from: filters[`${namespace}from`],
    to: filters[`${namespace}to`],
    minAmount: filters[`${namespace}min`],
    maxAmount: filters[`${namespace}max`],
    ...(scope === 'search' ? { status: filters[`${namespace}status`] } : {}),
  };

  const query = useExpenseAdminQuery(scope, params);
  const decide = useExpenseDecisionMutation();
  // Both people a row can name — the claimant and, on the second-approval
  // queue, whoever approved it first — resolved in one request.
  const people = usePeopleLookupRef({
    keycloakIds: (query.data?.content ?? []).flatMap((row) => [
      row.employeeKeycloakId,
      row.firstApproverKeycloakId,
    ]),
  });
  const [outcome, setOutcome] = useState<string | null>(null);
  // Read only where a decision is offered, and shared with the Threshold tab
  // through one cache entry — the confirmation has to name the outcome THIS
  // click produces, which is a comparison against this value.
  const threshold = useThresholdQuery();

  const columns = useMemo<ColumnDef<ExpenseResponse, unknown>[]>(() => {
    const base: ColumnDef<ExpenseResponse, unknown>[] = [
      {
        id: 'employee',
        header: 'Claimed by',
        // expense-service stores Keycloak subjects and joins no directory for
        // this projection; the shared people resolver names them.
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
        cell: ({ row }) => (
          <AppLink to={`/expenses/${row.original.id}`}>
            {formatDate(row.original.expenseDate)}
          </AppLink>
        ),
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
        // No `priority`: below `md` the amount is already the card's heading
        // (`cardTitle`), and a card that repeats its own title reads as a bug.
        meta: { align: 'right' },
        // Amount and currency exactly as stored — never converted, never summed
        // across currencies.
        cell: ({ row }) => formatMoney(row.original.amount, row.original.currency),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status', priority: true },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.hrEscalated ? <StatusBadge status="HR_ESCALATED" /> : null}
          </div>
        ),
      },
    ];

    if (scope === 'second-approval') {
      base.push({
        id: 'firstApprover',
        header: 'First approved by',
        meta: { hideBelowLg: true },
        cell: ({ row }) => (
          <PersonCell
            resolution={people.current.byKeycloakId(row.original.firstApproverKeycloakId)}
            fallback={row.original.firstApproverKeycloakId}
          />
        ),
      });
    } else {
      base.push({
        id: 'description',
        header: 'Description',
        meta: { hideBelowLg: true },
        cell: ({ row }) => row.original.description ?? '—',
      });
    }

    return base;
  }, [people, scope]);

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
          label={`Search ${caption.toLowerCase()}`}
          placeholder="Search descriptions"
        />
        {scope === 'search' ? (
          <FilterSelect
            label="Status"
            anyLabel="Any status"
            value={filters[`${namespace}status`]}
            onChange={(value) => setFilter(`${namespace}status`, value)}
            options={STATUS_OPTIONS}
          />
        ) : null}
        <FilterSelect
          label="Category"
          anyLabel="Any category"
          value={filters[`${namespace}category`]}
          onChange={(value) => setFilter(`${namespace}category`, value)}
          options={CATEGORY_OPTIONS}
        />
        <FilterDate
          label="Spent from"
          value={filters[`${namespace}from`]}
          onChange={(value) => setFilter(`${namespace}from`, value)}
        />
        <FilterDate
          label="Spent to"
          value={filters[`${namespace}to`]}
          onChange={(value) => setFilter(`${namespace}to`, value)}
        />
        {/*
          The amount range compares the NUMBER only — `ExpenseFilter` says so,
          because the platform holds one currency per claim and converts none.
          The labels carry no currency symbol for the same reason.
        */}
        <AmountFilter
          id={minId}
          label="Min amount"
          value={filters[`${namespace}min`]}
          onCommit={(next) => setFilter(`${namespace}min`, next)}
        />
        <AmountFilter
          id={maxId}
          label="Max amount"
          value={filters[`${namespace}max`]}
          onCommit={(next) => setFilter(`${namespace}max`, next)}
        />
      </FilterBar>

      <DataTable
        caption={caption}
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
          <EmptyState icon={ReceiptText} title={emptyTitle} description={emptyDescription} />
        }
        noMatchesState={
          <EmptyState
            icon={SearchX}
            title="No claims match these filters"
            description="Claims exist here — none match what you have narrowed it to."
          />
        }
        {...(decidable(scope)
          ? {
              rowActions: (row: ExpenseResponse) => {
                const own = row.employeeKeycloakId === subject;
                const alreadyApprovedOnce =
                  scope === 'second-approval' && row.firstApproverKeycloakId === subject;
                const approveRefusedReason = own
                  ? 'You cannot decide your own claim (BR-02).'
                  : alreadyApprovedOnce
                    ? 'You gave the first approval — the second must come from someone else (BR-03).'
                    : undefined;
                const rejectRefusedReason = own
                  ? 'You cannot decide your own claim (BR-02).'
                  : undefined;

                return (
                  <ApprovalActions
                    subject={
                      <>
                        {formatMoney(row.amount, row.currency)} for{' '}
                        {(CATEGORY_LABELS[row.category] ?? row.category).toLowerCase()}, spent{' '}
                        {formatDate(row.expenseDate)}.{' '}
                        {approvalConsequence(scope, row, threshold.data)}
                      </>
                    }
                    rowLabel={`${formatMoney(row.amount, row.currency)} claim from ${formatDate(row.expenseDate)}`}
                    commentMaxLength={EXPENSE_TEXT_MAX}
                    busy={decide.isPending}
                    onDialogOpen={() => setOutcome(null)}
                    onConflict={() => void query.refetch()}
                    {...(approveRefusedReason ? { approveRefusedReason } : {})}
                    {...(rejectRefusedReason ? { rejectRefusedReason } : {})}
                    onDecide={async (decision, comment) => {
                      const updated = await decide.mutateAsync({
                        id: row.id,
                        decision,
                        ...(comment ? { comment } : {}),
                      });
                      // The status the SERVER chose — an approval on an
                      // above-threshold claim is not an approval yet.
                      setOutcome(
                        updated.status === 'PENDING_SECOND_APPROVAL'
                          ? `${formatMoney(updated.amount, updated.currency)} sent for second-level approval — it is above the threshold, so a second HR or Admin sign-off is needed before it is final.`
                          : updated.status === 'APPROVED'
                            ? `${formatMoney(updated.amount, updated.currency)} approved.`
                            : `${formatMoney(updated.amount, updated.currency)} rejected.`,
                      );
                    }}
                  />
                );
              },
            }
          : {})}
      />
    </div>
  );
}

/**
 * One bound of the amount range. Debounced like the search box beside it:
 * these write to the URL, and the URL is what the request is built from, so an
 * un-debounced control turns `1250.00` into seven requests and seven history
 * entries.
 */
function AmountFilter({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useDebouncedValue(value ?? '', (next) => onCommit(next || undefined));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">
        {label}
      </label>
      <Input
        id={id}
        compact
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        className="w-28"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}
