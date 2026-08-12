import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import type { AnalyticsDashboardResponse } from '@/shared/types/analytics';

/**
 * The analytics dashboard (P24), verified against `AnalyticsController`:
 *
 *   GET /api/analytics/dashboard          HR+ADMIN · every section, one call
 *   GET /api/analytics/employees          the same EmployeeSummary on its own
 *   GET /api/analytics/leave-summary      …
 *   GET /api/analytics/expense-summary    …
 *   GET /api/analytics/documents-summary  …
 *
 * The page uses `/dashboard` alone. The four per-section endpoints return the
 * identical records through the identical gateways, so splitting the page into
 * four requests would buy nothing and cost a consistent `generatedAt`: the
 * composite stamps ONE moment across all four sections, and four independent
 * calls would put four different moments on one screen.
 *
 * **These are aggregates, not collections.** api-conventions §1 lists
 * `/api/analytics/**` among the deliberately unpaged surfaces — there is no
 * envelope, no `page`, no `sort`, and none is invented here.
 *
 * **`available: false` is the contract.** Each section is assembled through a
 * circuit breaker with a snapshot cache; when a source cannot be reached, the
 * section is built by its `unavailable()` factory, which sets every count to
 * zero. Consumers must branch on `available` before reading a single figure —
 * see `AvailabilityGuard`.
 */

export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: () => [...analyticsKeys.all, 'dashboard'] as const,
};

export function useAnalyticsDashboardQuery(
  enabled = true,
): UseQueryResult<AnalyticsDashboardResponse> {
  return useQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<AnalyticsDashboardResponse>('/api/analytics/dashboard', {
        signal,
      });
      return data;
    },
    enabled,
    // Analytics tier (FRONTEND-ARCHITECTURE §6): the sources are snapshots
    // behind a cache, so refetching faster than they refresh only costs round
    // trips. The page shows `generatedAt` and offers an explicit refresh.
    staleTime: 5 * 60_000,
  });
}
