import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import type { NotificationCountResponse } from '@/shared/types/hr';

/**
 * `GET /api/hr/notifications/count` — the unread badge number, in ONE place.
 *
 * **Why this lives in `shared/` rather than in `features/notifications`.** Two
 * surfaces render this number and they are visible at the same time: the top-bar
 * bell (always mounted) and the dashboard's "Unread notifications" tile. Each
 * feature having its own copy meant two requests to one endpoint under two cache
 * keys — and, worse, the notification mark-read mutations only ever adjusted
 * their own key, so marking something read updated the bell and left the tile
 * on the landing page showing the old number. Cross-feature reuse is promoted to
 * `shared/` first (FRONTEND-ARCHITECTURE §14); this is that promotion, and the
 * ≥2-real-consumers bar is met exactly.
 *
 * The key is deliberately still `['notifications', 'count']`: it stays under the
 * `notificationKeys.all` prefix, so the feature's optimistic read-state path —
 * its `cancelQueries`, snapshot/restore and `invalidateQueries` — keeps working
 * on it unchanged. `features/notifications` re-exports this key rather than
 * declaring a second one.
 *
 * **The poll.** This is the application's only `refetchInterval`.
 * `refetchIntervalInBackground` stays at its default `false`, and that is a
 * security constraint rather than a performance one: a poll running in a hidden
 * tab would 401 on the lapsed access token, trigger a renewal, and every refresh
 * grant resets Keycloak's `lastSessionRefresh`. An abandoned tab would hold a
 * session open for the full 8-hour maximum and silently defeat the realm's
 * 30-minute idle timeout — the exact behaviour the renewal visibility gate
 * exists to prevent (FRONTEND-ARCHITECTURE §5.1).
 */

/** `NotificationController` publishes no interval; 60s is the product decision. */
export const UNREAD_COUNT_POLL_MS = 60_000;

/** THE cache key for the unread count. Under the `notifications` prefix by design. */
export const unreadCountKey = ['notifications', 'count'] as const;

export function useUnreadCountQuery(): UseQueryResult<number> {
  return useQuery({
    queryKey: unreadCountKey,
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<NotificationCountResponse>(
        '/api/hr/notifications/count',
        { signal },
      );
      return data.unread;
    },
    staleTime: UNREAD_COUNT_POLL_MS,
    refetchInterval: UNREAD_COUNT_POLL_MS,
  });
}
