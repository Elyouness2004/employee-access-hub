import { QueryClient } from '@tanstack/react-query';

import { isRetryableApiError } from './problem';

/**
 * Production Query Client defaults (FRONTEND-ARCHITECTURE §6).
 * Per-feature hooks override staleTime to the documented tiers
 * (catalogues 30min · directory/team 1min · own lists 30s · queues 15s ·
 * notification count 60s poll · analytics 5min · audit 0).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Conservative default: "own lists" tier. Features tune per data class.
        staleTime: 30_000,
        // Keep unmounted data for quick back-navigation without hoarding.
        gcTime: 5 * 60_000,
        // Up to 2 retries, only for transient failures (network/502/503) —
        // never a 4xx.
        retry: (failureCount, error) => failureCount < 2 && isRetryableApiError(error),
        // Stale-while-revalidate on tab focus/reconnect; staleTime gates churn.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // Approve/decide are not idempotent — mutations NEVER auto-retry.
        retry: false,
      },
    },
  });
}
