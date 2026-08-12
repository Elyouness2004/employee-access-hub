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
  BalanceAdjustmentRequest,
  LeaveBalanceResponse,
  LeaveRequestResponse,
  LeaveStatus,
  LeaveType,
  SubmitLeaveRequest,
} from '@/shared/types/leave';

/**
 * Leave self-service, the manager inbox and the HR administration surface
 * (P05, P06, P09, the leave half of P14, and P20).
 *
 * Verified against `LeaveRequestController` / `LeaveBalanceController`:
 *
 *   POST   /api/leave/requests            submit (EMPLOYEE) — 422 on BR-01/BR-03
 *   GET    /api/leave/requests/my         own, paged; filters status,type,from,to,search
 *   GET    /api/leave/requests/inbox      MANAGER only; filters type,from,to,search (no status —
 *                                         the queue is pending by definition)
 *   GET    /api/leave/requests/escalated  HR+ADMIN; same filters, same reason for no status —
 *                                         the scope is pinned to hrEscalated AND SUBMITTED
 *   GET    /api/leave/requests/{id}       owner, addressed manager, HR/ADMIN — else 403
 *   POST   /api/leave/requests/{id}/approve|reject   decision, optional comment ≤500
 *   POST   /api/leave/requests/{id}/cancel           owner only, SUBMITTED only (409 after)
 *   GET    /api/leave/balances/my         own balance; provisions the default on first use
 *   GET    /api/leave/balances/{employeeId}          HR+ADMIN, optional ?year
 *   PUT    /api/leave/balances/{employeeId}          HR+ADMIN, optional ?year; 422 below usedDays
 *
 * `from`/`to` bound the leave PERIOD, not the submission timestamp
 * (api-conventions §1) — the filter labels say so.
 *
 * **There is no global leave list.** `LeaveRequestController` exposes exactly
 * three collections — own, addressed-to-me, escalated-to-HR — and every one of
 * them pins its scope in SQL (`LeaveRequestSpecifications`). HR can read any
 * single request by id, but cannot browse all of them; P20 says so rather than
 * faking the surface out of the escalation queue.
 */

/** `LeaveRequestController.SORTABLE`; anything else is dropped by the server. */
export const LEAVE_SORTABLE = ['createdAt', 'status', 'type', 'businessDays', 'decidedAt'] as const;

/** `@PageableDefault(size = 20, sort = "createdAt", direction = DESC)`. */
export const LEAVE_DEFAULT_SORT = 'createdAt,desc';
/** The inbox defaults to OLDEST first — the longest wait is the most urgent. */
export const LEAVE_INBOX_DEFAULT_SORT = 'createdAt,asc';
/** `@PageableDefault(size = 20, sort = "createdAt")` on `/escalated` — oldest first. */
export const LEAVE_ESCALATED_DEFAULT_SORT = 'createdAt,asc';
export const LEAVE_PAGE_SIZE = 20;

/** `@Size(max = 500)` on `DecisionRequest.comment` and `SubmitLeaveRequest.reason`. */
export const LEAVE_TEXT_MAX = 500;
/** `@Size(max = 500)` on `BalanceAdjustmentRequest.reason`. */
export const BALANCE_REASON_MAX = 500;

/**
 * The leave years the balance surface offers. Both balance endpoints take an
 * optional `?year` and default to `LocalDate.now().getYear()`; the service
 * provisions a row on first read, so a year with no history is a legal request
 * rather than an error. Next year is included because allocations are set
 * ahead of time.
 */
export function balanceYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current + 1, current, current - 1, current - 2];
}

export interface MyLeaveParams {
  page: number;
  sort: string | undefined;
  search: string;
  status: string | undefined;
  type: string | undefined;
  from: string | undefined;
  to: string | undefined;
}

export interface LeaveInboxParams {
  page: number;
  sort: string | undefined;
  search: string;
  type: string | undefined;
  from: string | undefined;
  to: string | undefined;
}

export const leaveKeys = {
  all: ['leave'] as const,
  my: (params: MyLeaveParams) => [...leaveKeys.all, 'my', params] as const,
  myAll: () => [...leaveKeys.all, 'my'] as const,
  inbox: (params: LeaveInboxParams) => [...leaveKeys.all, 'inbox', params] as const,
  inboxAll: () => [...leaveKeys.all, 'inbox'] as const,
  escalated: (params: LeaveInboxParams) => [...leaveKeys.all, 'escalated', params] as const,
  escalatedAll: () => [...leaveKeys.all, 'escalated'] as const,
  request: (id: string) => [...leaveKeys.all, 'request', id] as const,
  /**
   * The ancestor of EVERY balance read — own and per-employee alike. A decision
   * debits a balance server-side, so both have to be invalidated together;
   * keeping them under one prefix is what makes that a single call that cannot
   * forget one of them.
   */
  balance: () => [...leaveKeys.all, 'balance'] as const,
  employeeBalance: (employeeId: string, year: number | undefined) =>
    [...leaveKeys.balance(), 'employee', employeeId, year ?? 'current'] as const,
};

function listParams(params: {
  page: number;
  sort: string | undefined;
  search: string;
  defaultSort: string;
  status?: string | undefined;
  type?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}) {
  return {
    ...toPageParams({
      page: params.page,
      size: LEAVE_PAGE_SIZE,
      sort: params.sort ?? params.defaultSort,
      search: params.search,
    }),
    ...(params.status ? { status: params.status as LeaveStatus } : {}),
    ...(params.type ? { type: params.type as LeaveType } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  };
}

export function useMyLeaveQuery(
  params: MyLeaveParams,
): UseQueryResult<PageResponse<LeaveRequestResponse>> {
  return useQuery({
    queryKey: leaveKeys.my(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<LeaveRequestResponse>>(
        '/api/leave/requests/my',
        { signal, params: listParams({ ...params, defaultSort: LEAVE_DEFAULT_SORT }) },
      );
      return data;
    },
    // "Own lists" tier (FRONTEND-ARCHITECTURE §6).
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeaveInboxQuery(
  params: LeaveInboxParams,
): UseQueryResult<PageResponse<LeaveRequestResponse>> {
  return useQuery({
    queryKey: leaveKeys.inbox(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<LeaveRequestResponse>>(
        '/api/leave/requests/inbox',
        { signal, params: listParams({ ...params, defaultSort: LEAVE_INBOX_DEFAULT_SORT }) },
      );
      return data;
    },
    // Approval queues move under you while you look at them: 15s.
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * `GET /api/leave/requests/escalated` — the HR queue (P20).
 *
 * `LeaveRequestSpecifications.escalated()` pins the scope to
 * `hrEscalated = true AND status = SUBMITTED`, so this list is always pending
 * and always escalated. That is why it takes no status filter: the server would
 * have nothing to narrow.
 */
export function useEscalatedLeaveQuery(
  params: LeaveInboxParams,
): UseQueryResult<PageResponse<LeaveRequestResponse>> {
  return useQuery({
    queryKey: leaveKeys.escalated(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<LeaveRequestResponse>>(
        '/api/leave/requests/escalated',
        { signal, params: listParams({ ...params, defaultSort: LEAVE_ESCALATED_DEFAULT_SORT }) },
      );
      return data;
    },
    // An approval queue moves under you while you look at it.
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeaveRequestQuery(id: string): UseQueryResult<LeaveRequestResponse> {
  return useQuery({
    queryKey: leaveKeys.request(id),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<LeaveRequestResponse>(`/api/leave/requests/${id}`, {
        signal,
      });
      return data;
    },
    staleTime: 30_000,
  });
}

/**
 * `GET /api/leave/balances/my`. The service PROVISIONS the default allocation on
 * first use, so a 404 here does not mean "no balance row" — it means no employee
 * record is linked to this account at all.
 */
export function useMyBalanceQuery(year?: number): UseQueryResult<LeaveBalanceResponse> {
  return useQuery({
    queryKey: [...leaveKeys.balance(), year ?? 'current'] as const,
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<LeaveBalanceResponse>('/api/leave/balances/my', {
        signal,
        ...(year ? { params: { year } } : {}),
      });
      return data;
    },
    staleTime: 60_000,
  });
}

/**
 * `GET /api/leave/balances/{employeeId}` — HR/ADMIN lookup (P20).
 *
 * Takes an **HR employee id**, never a Keycloak subject: the path variable is
 * matched against `LeaveBalance.employeeId`, and `requireByEmployeeId` falls
 * back to the HR directory by the same id.
 *
 * Two failures that mean different things and must not be merged:
 *  - **404** — no such employee (`ResourceNotFoundException("employee", id)`);
 *  - **422 `Employee not eligible`** — the employee exists but has no identity
 *    link yet, so no allocation can be provisioned.
 */
export function useEmployeeBalanceQuery(
  employeeId: string,
  year: number | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<LeaveBalanceResponse> {
  return useQuery({
    queryKey: leaveKeys.employeeBalance(employeeId, year),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<LeaveBalanceResponse>(
        `/api/leave/balances/${employeeId}`,
        { signal, ...(year ? { params: { year } } : {}) },
      );
      return data;
    },
    enabled: options.enabled ?? Boolean(employeeId),
    staleTime: 60_000,
  });
}

export interface BalanceAdjustment extends BalanceAdjustmentRequest {
  employeeId: string;
  year?: number | undefined;
}

/**
 * `PUT /api/leave/balances/{employeeId}` (FR-22, audit-logged).
 *
 * The floor is the server's: `LeaveBalance.adjustTotal` refuses an allocation
 * below the days already used and answers 422. The form states that floor up
 * front and renders the server's sentence when it is crossed — it does not
 * re-implement the comparison, because `usedDays` can change between the read
 * and the write.
 */
export function useAdjustBalanceMutation(): UseMutationResult<
  LeaveBalanceResponse,
  unknown,
  BalanceAdjustment
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, year, ...body }: BalanceAdjustment) => {
      const { data } = await apiClient.put<LeaveBalanceResponse>(
        `/api/leave/balances/${employeeId}`,
        body,
        year ? { params: { year } } : {},
      );
      return data;
    },
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(
        leaveKeys.employeeBalance(variables.employeeId, variables.year),
        updated,
      );
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balance() });
    },
  });
}

export function useSubmitLeaveMutation(): UseMutationResult<
  LeaveRequestResponse,
  unknown,
  SubmitLeaveRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitLeaveRequest) => {
      const { data } = await apiClient.post<LeaveRequestResponse>('/api/leave/requests', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myAll() });
      // Submitting does not debit the balance (approval does), but the
      // available figure is what people check next, and a stale one here is
      // the difference between submitting a second request and not.
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balance() });
    },
  });
}

export function useCancelLeaveMutation(): UseMutationResult<LeaveRequestResponse, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<LeaveRequestResponse>(
        `/api/leave/requests/${id}/cancel`,
      );
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(leaveKeys.request(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myAll() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balance() });
    },
  });
}

export interface LeaveDecision {
  id: string;
  decision: 'approve' | 'reject';
  comment?: string;
}

/**
 * Approve or reject. **Never optimistic**: a 409 here means somebody else
 * decided first, and showing the row as decided before the server agrees would
 * be inventing an outcome (FRONTEND-ARCHITECTURE §6).
 */
export function useLeaveDecisionMutation(): UseMutationResult<
  LeaveRequestResponse,
  unknown,
  LeaveDecision
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, comment }: LeaveDecision) => {
      const { data } = await apiClient.post<LeaveRequestResponse>(
        `/api/leave/requests/${id}/${decision}`,
        comment ? { comment } : {},
      );
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(leaveKeys.request(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: leaveKeys.inboxAll() });
      // The same endpoint serves the manager inbox and the HR escalation queue,
      // and a decision removes the row from whichever one held it.
      void queryClient.invalidateQueries({ queryKey: leaveKeys.escalatedAll() });
      // An approval debits the requester's balance atomically server-side, so
      // any balance view in this browser is now wrong — own or per-employee.
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balance() });
    },
  });
}
