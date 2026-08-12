import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import type {
  CreateExpenseRequest,
  ExpenseCategory,
  ExpenseResponse,
  ExpenseStatus,
  ThresholdRequest,
  ThresholdResponse,
} from '@/shared/types/expenses';

/**
 * Expense self-service, the manager queue and the HR administration surface
 * (P07, P08, the expense half of P14, and P21).
 *
 * Verified against `ExpenseController` / `ExpenseThresholdController`:
 *
 *   POST   /api/expenses                  create (EMPLOYEE)
 *   GET    /api/expenses/my               own, paged; filters status,category,from,to,
 *                                         minAmount,maxAmount,search
 *   GET    /api/expenses/pending          MANAGER only — first-level queue for direct reports
 *   GET    /api/expenses/escalated        HR+ADMIN — first-level claims escalated per BR-02
 *   GET    /api/expenses/second-approval  HR+ADMIN — PENDING_SECOND_APPROVAL (BR-03)
 *   GET    /api/expenses/search           HR+ADMIN — EVERY claim; adds the `status` filter
 *   GET    /api/expenses/{id}             owner, manager, HR/ADMIN
 *   POST   /api/expenses/{id}/cancel      owner only, SUBMITTED only (409 after)
 *   POST   /api/expenses/{id}/approve     first level, or HR/ADMIN second level
 *   POST   /api/expenses/{id}/reject
 *   GET    /api/expenses/threshold        HR+ADMIN — current BR-03 threshold + provenance
 *   PUT    /api/expenses/threshold        HR+ADMIN — audited change
 *
 * `from`/`to` bound the EXPENSE DATE, not the submission timestamp.
 * `minAmount`/`maxAmount` compare the NUMBER only — `ExpenseFilter` says so
 * explicitly, because mixing currencies is what BR-03 refuses to do.
 *
 * The threshold endpoint is **HR/ADMIN only**: an employee or a manager gets
 * 403. The self-service form therefore states the rule rather than a number
 * (FRONTEND-SPECIFICATION §5, P07); only the P21 surface reads the value.
 */

/** `ExpenseController.SORTABLE`; anything else is silently dropped. */
export const EXPENSE_SORTABLE = [
  'createdAt',
  'expenseDate',
  'status',
  'category',
  'decidedAt',
] as const;

export const EXPENSE_DEFAULT_SORT = 'createdAt,desc';
/** The manager queue defaults to oldest-first — longest wait, most urgent. */
export const EXPENSE_PENDING_DEFAULT_SORT = 'createdAt,asc';
/** Both HR queues use `@PageableDefault(sort = "createdAt")` — ascending. */
export const EXPENSE_QUEUE_DEFAULT_SORT = 'createdAt,asc';
/** `/search` is a browse surface: `@PageableDefault(..., direction = DESC)`. */
export const EXPENSE_SEARCH_DEFAULT_SORT = 'createdAt,desc';
export const EXPENSE_PAGE_SIZE = 20;

/** `@Size(max = 500)` on description and on the decision comment. */
export const EXPENSE_TEXT_MAX = 500;

export interface MyExpensesParams {
  page: number;
  sort: string | undefined;
  search: string;
  status: string | undefined;
  category: string | undefined;
  from: string | undefined;
  to: string | undefined;
}

export interface ExpenseQueueParams {
  page: number;
  sort: string | undefined;
  search: string;
  category: string | undefined;
  from: string | undefined;
  to: string | undefined;
}

/**
 * The HR list parameters (P21). Adds the amount range every HR endpoint accepts,
 * and `status` — which **only `/search` honours**; the two queues pin their own
 * status in SQL and would ignore it.
 */
export interface ExpenseAdminParams extends ExpenseQueueParams {
  minAmount: string | undefined;
  maxAmount: string | undefined;
  status?: string | undefined;
}

/** Which HR collection a queue reads — one component serves all three. */
export type ExpenseAdminScope = 'escalated' | 'second-approval' | 'search';

export const expenseKeys = {
  all: ['expenses'] as const,
  my: (params: MyExpensesParams) => [...expenseKeys.all, 'my', params] as const,
  myAll: () => [...expenseKeys.all, 'my'] as const,
  pending: (params: ExpenseQueueParams) => [...expenseKeys.all, 'pending', params] as const,
  pendingAll: () => [...expenseKeys.all, 'pending'] as const,
  admin: (scope: ExpenseAdminScope, params: ExpenseAdminParams) =>
    [...expenseKeys.all, 'admin', scope, params] as const,
  adminAll: () => [...expenseKeys.all, 'admin'] as const,
  claim: (id: string) => [...expenseKeys.all, 'claim', id] as const,
  threshold: () => [...expenseKeys.all, 'threshold'] as const,
};

function listParams(params: {
  page: number;
  sort: string | undefined;
  search: string;
  defaultSort: string;
  status?: string | undefined;
  category?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  minAmount?: string | undefined;
  maxAmount?: string | undefined;
}) {
  return {
    ...toPageParams({
      page: params.page,
      size: EXPENSE_PAGE_SIZE,
      sort: params.sort ?? params.defaultSort,
      search: params.search,
    }),
    ...(params.status ? { status: params.status as ExpenseStatus } : {}),
    ...(params.category ? { category: params.category as ExpenseCategory } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.minAmount ? { minAmount: params.minAmount } : {}),
    ...(params.maxAmount ? { maxAmount: params.maxAmount } : {}),
  };
}

export function useMyExpensesQuery(
  params: MyExpensesParams,
): UseQueryResult<PageResponse<ExpenseResponse>> {
  return useQuery({
    queryKey: expenseKeys.my(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<ExpenseResponse>>('/api/expenses/my', {
        signal,
        params: listParams({ ...params, defaultSort: EXPENSE_DEFAULT_SORT }),
      });
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useExpenseQueueQuery(
  params: ExpenseQueueParams,
): UseQueryResult<PageResponse<ExpenseResponse>> {
  return useQuery({
    queryKey: expenseKeys.pending(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<ExpenseResponse>>('/api/expenses/pending', {
        signal,
        params: listParams({ ...params, defaultSort: EXPENSE_PENDING_DEFAULT_SORT }),
      });
      return data;
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** Endpoint and default ordering per HR scope — the only thing that differs. */
const ADMIN_SCOPES: Record<ExpenseAdminScope, { path: string; defaultSort: string }> = {
  escalated: { path: '/api/expenses/escalated', defaultSort: EXPENSE_QUEUE_DEFAULT_SORT },
  'second-approval': {
    path: '/api/expenses/second-approval',
    defaultSort: EXPENSE_QUEUE_DEFAULT_SORT,
  },
  search: { path: '/api/expenses/search', defaultSort: EXPENSE_SEARCH_DEFAULT_SORT },
};

/**
 * The three HR/ADMIN collections (P21) behind one hook.
 *
 * They are the same DTO, the same filters and the same sort whitelist; only the
 * scope differs, and that scope is the server's (`ExpenseSpecifications`), not a
 * parameter. `status` is sent only for `/search` — the two queues pin their own
 * status in SQL, so passing one there would be a filter the user believes in and
 * the server ignores.
 */
export function useExpenseAdminQuery(
  scope: ExpenseAdminScope,
  params: ExpenseAdminParams,
): UseQueryResult<PageResponse<ExpenseResponse>> {
  const { path, defaultSort } = ADMIN_SCOPES[scope];
  return useQuery({
    queryKey: expenseKeys.admin(scope, params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<ExpenseResponse>>(path, {
        signal,
        params: listParams({
          ...params,
          defaultSort,
          ...(scope === 'search' ? { status: params.status } : { status: undefined }),
        }),
      });
      return data;
    },
    // A decision queue moves under you; the browse surface is calmer but shares
    // the tier, because a claim decided elsewhere must not linger here either.
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * `GET /api/expenses/threshold` — the BR-03 second-level threshold with its
 * provenance (`updatedBy`, `updatedAt`). HR/ADMIN only; anyone else gets 403.
 *
 * Configuration tier: it changes rarely and every claim decision is read against
 * the server's copy anyway, so a 5-minute stale window costs nothing.
 */
export function useThresholdQuery(): UseQueryResult<ThresholdResponse> {
  return useQuery({
    queryKey: expenseKeys.threshold(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<ThresholdResponse>('/api/expenses/threshold', {
        signal,
      });
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * `PUT /api/expenses/threshold` (audited).
 *
 * Changing it changes which future claims need a second sign-off. It does NOT
 * re-evaluate claims already routed: `secondApprovalRequired` was written at
 * first approval and the queue reads `status`, so anything already awaiting
 * sign-off stays there. The confirmation says so.
 */
export function useUpdateThresholdMutation(): UseMutationResult<
  ThresholdResponse,
  unknown,
  ThresholdRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ThresholdRequest) => {
      const { data } = await apiClient.put<ThresholdResponse>('/api/expenses/threshold', body);
      return data;
    },
    onSuccess: (updated) => queryClient.setQueryData(expenseKeys.threshold(), updated),
  });
}

export function useExpenseQuery(id: string): UseQueryResult<ExpenseResponse> {
  return useQuery({
    queryKey: expenseKeys.claim(id),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<ExpenseResponse>(`/api/expenses/${id}`, { signal });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useCreateExpenseMutation(): UseMutationResult<
  ExpenseResponse,
  unknown,
  CreateExpenseRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateExpenseRequest) => {
      const { data } = await apiClient.post<ExpenseResponse>('/api/expenses', body);
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseKeys.myAll() }),
  });
}

export function useCancelExpenseMutation(): UseMutationResult<ExpenseResponse, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ExpenseResponse>(`/api/expenses/${id}/cancel`);
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(expenseKeys.claim(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: expenseKeys.myAll() });
      // A cancelled claim leaves the escalation queue and changes what the HR
      // search returns — both are stale the moment this succeeds.
      void queryClient.invalidateQueries({ queryKey: expenseKeys.adminAll() });
    },
  });
}

export interface ExpenseDecision {
  id: string;
  decision: 'approve' | 'reject';
  comment?: string;
}

/**
 * Approve or reject. Never optimistic.
 *
 * Approving is the one decision in the product whose OUTCOME the approver
 * cannot predict: below the threshold it finishes the claim, above it the
 * server moves it to `PENDING_SECOND_APPROVAL` (BR-03). The mutation therefore
 * returns the updated claim and callers report the status the server chose —
 * "sent for second-level approval" is not "approved".
 */
export function useExpenseDecisionMutation(): UseMutationResult<
  ExpenseResponse,
  unknown,
  ExpenseDecision
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, comment }: ExpenseDecision) => {
      const { data } = await apiClient.post<ExpenseResponse>(
        `/api/expenses/${id}/${decision}`,
        comment ? { comment } : {},
      );
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(expenseKeys.claim(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: expenseKeys.pendingAll() });
      // A first approval MOVES a claim from one HR queue into another
      // (escalated → second-approval), and every decision changes what
      // `/search` returns. One prefix covers all three.
      void queryClient.invalidateQueries({ queryKey: expenseKeys.adminAll() });
    },
  });
}
