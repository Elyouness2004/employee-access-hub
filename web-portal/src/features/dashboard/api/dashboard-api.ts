import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import type { AnalyticsDashboardResponse } from '@/shared/types/analytics';
import type { AuditStatisticsResponse } from '@/shared/types/hr';
import type { ExpenseResponse } from '@/shared/types/expenses';
import type { LeaveBalanceResponse, LeaveRequestResponse } from '@/shared/types/leave';

/**
 * Dashboard composition (P04).
 *
 * The dashboard is defined as "composition of others' APIs"
 * (FRONTEND-ARCHITECTURE §3) and a feature may not import another feature, so it
 * owns thin, dashboard-shaped queries over the SAME shared DTO types rather than
 * reaching into `leave`/`expenses`. Its cache keys are its own, and they are
 * deliberately small requests (`size=1`, `size=5`) — the dashboard needs counts
 * and a preview, not lists.
 *
 * Every widget here is backed by a real endpoint. Nothing on this page is
 * computed from data the SPA does not have, and there is no metric without an
 * endpoint behind it.
 */

export const dashboardKeys = {
  all: ['dashboard'] as const,
  leaveBalance: () => [...dashboardKeys.all, 'leave-balance'] as const,
  leaveCount: (status: string) => [...dashboardKeys.all, 'leave-count', status] as const,
  expenseCount: (status: string) => [...dashboardKeys.all, 'expense-count', status] as const,
  leaveInboxPreview: () => [...dashboardKeys.all, 'leave-inbox-preview'] as const,
  expenseQueueCount: () => [...dashboardKeys.all, 'expense-queue-count'] as const,
  analytics: () => [...dashboardKeys.all, 'analytics'] as const,
  auditActivity: () => [...dashboardKeys.all, 'audit-activity'] as const,
  provisioningFailures: () => [...dashboardKeys.all, 'provisioning-failures'] as const,
};

/**
 * A count with no rows: `size=1` and read `totalElements`. The paged envelope
 * gives the total for free, so counting does not mean downloading a list.
 */
async function countOf(url: string, params: Record<string, unknown>, signal: AbortSignal) {
  const { data } = await apiClient.get<PageResponse<unknown>>(url, {
    signal,
    params: { ...toPageParams({ page: 0, size: 1 }), ...params },
  });
  return data.totalElements;
}

export function useDashboardBalanceQuery(): UseQueryResult<LeaveBalanceResponse> {
  return useQuery({
    queryKey: dashboardKeys.leaveBalance(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<LeaveBalanceResponse>('/api/leave/balances/my', {
        signal,
      });
      return data;
    },
    staleTime: 60_000,
  });
}

/** Own leave requests in a given status — `SUBMITTED` is "waiting on someone". */
export function useMyLeaveCountQuery(status: string): UseQueryResult<number> {
  return useQuery({
    queryKey: dashboardKeys.leaveCount(status),
    queryFn: ({ signal }) => countOf('/api/leave/requests/my', { status }, signal),
    staleTime: 30_000,
  });
}

/**
 * Own expense claims in a given status. Called twice — `SUBMITTED` and
 * `PENDING_SECOND_APPROVAL` — because those are two different answers to "where
 * is my money?": one is waiting on a first decision, the other cleared its first
 * approval and is waiting on HR (BR-03). Collapsing them into one number would
 * tell a claimant their claim is further along than it is.
 */
export function useMyExpenseCountQuery(status: string): UseQueryResult<number> {
  return useQuery({
    queryKey: dashboardKeys.expenseCount(status),
    queryFn: ({ signal }) => countOf('/api/expenses/my', { status }, signal),
    staleTime: 30_000,
  });
}

/** MANAGER tier: the five oldest requests awaiting this manager, plus the total. */
export function useLeaveInboxPreviewQuery(
  enabled: boolean,
): UseQueryResult<PageResponse<LeaveRequestResponse>> {
  return useQuery({
    queryKey: dashboardKeys.leaveInboxPreview(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<LeaveRequestResponse>>(
        '/api/leave/requests/inbox',
        { signal, params: toPageParams({ page: 0, size: 5, sort: 'createdAt,asc' }) },
      );
      return data;
    },
    // MANAGER-only endpoint: a non-manager would get 403, so the query is not
    // even started for them — guards are UX, but a request that is certain to
    // be denied is noise.
    enabled,
    staleTime: 15_000,
  });
}

/** MANAGER tier: how many expense claims are waiting on this manager. */
export function useExpenseQueueCountQuery(
  enabled: boolean,
): UseQueryResult<PageResponse<ExpenseResponse>> {
  return useQuery({
    queryKey: dashboardKeys.expenseQueueCount(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<ExpenseResponse>>('/api/expenses/pending', {
        signal,
        params: toPageParams({ page: 0, size: 1, sort: 'createdAt,asc' }),
      });
      return data;
    },
    enabled,
    staleTime: 15_000,
  });
}

// ── Governance tier (HR + ADMIN) ───────────────────────────────────────────

/**
 * The three governance reads, kept as dashboard-shaped queries of the
 * dashboard's own rather than borrowed from `analytics` and `audit`.
 *
 * That is the §3 rule for this feature ("composition of others' APIs") and the
 * §14 boundary (a feature never imports another feature) — the cost is that
 * `/api/analytics/dashboard` is cached under two keys if someone visits both
 * this page and `/analytics`, which was the same trade Phase 3 accepted for
 * leave and expenses. The alternative, importing another feature's hooks, buys
 * one fewer request and gives two features one cache to fight over.
 *
 * All three are HR/ADMIN endpoints, so all three take `enabled`: a request
 * certain to answer 403 is noise in the audit trail as well as in the console.
 */
export function useGovernanceAnalyticsQuery(
  enabled: boolean,
): UseQueryResult<AnalyticsDashboardResponse> {
  return useQuery({
    queryKey: dashboardKeys.analytics(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<AnalyticsDashboardResponse>('/api/analytics/dashboard', {
        signal,
      });
      return data;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** The audit activity series behind the sparkline — the server's own 30-day default. */
export function useAuditActivityQuery(enabled: boolean): UseQueryResult<AuditStatisticsResponse> {
  return useQuery({
    queryKey: dashboardKeys.auditActivity(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<AuditStatisticsResponse>('/api/hr/audit/statistics', {
        signal,
      });
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * How many employee records are in provisioning state FAILED.
 *
 * `EmployeeResponse` carries no `provisioningStatus` (the Phase 4 finding), but
 * `GET /api/hr/employees` does accept it as a **filter** — so the count is a
 * genuine server-side answer even though the rows could not display the state
 * themselves. `size=1` reads `totalElements` and downloads nothing, and the
 * alert links to the same filter so "which ones" is one click away.
 */
export function useProvisioningFailureCountQuery(enabled: boolean): UseQueryResult<number> {
  return useQuery({
    queryKey: dashboardKeys.provisioningFailures(),
    queryFn: ({ signal }) => countOf('/api/hr/employees', { provisioningStatus: 'FAILED' }, signal),
    enabled,
    staleTime: 60_000,
  });
}
