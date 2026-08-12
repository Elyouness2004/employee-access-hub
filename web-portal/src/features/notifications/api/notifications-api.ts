import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, toPageParams, type PageResponse } from '@/shared/api';
import { unreadCountKey } from '@/shared/notifications';
import type { NotificationReadAllResponse, NotificationResponse } from '@/shared/types/hr';

/**
 * The Notification Center (P12) and the top-bar bell, verified against
 * `NotificationController`:
 *
 *   GET   /api/hr/notifications          authenticated · **page + size only**
 *   GET   /api/hr/notifications/unread   authenticated · unpaged list, newest first
 *   GET   /api/hr/notifications/count    authenticated · { unread }
 *   PATCH /api/hr/notifications/{id}/read    idempotent · 404 when not mine
 *   PATCH /api/hr/notifications/read-all     → { markedRead }
 *
 * **What this endpoint cannot do, and why nothing here pretends otherwise.**
 * `sanitize()` keeps the page number and a clamped size and replaces the sort
 * with `Sort.unsorted()` — ordering is fixed newest-first by the repository
 * query. The controller accepts no `search`, no `category` and no read-state
 * parameter. So the center offers no sort control, no search box and no
 * category filter: an affordance the server silently ignores reads as a bug the
 * user cannot report, and filtering one fetched page client-side would be a lie
 * about how much data exists (`docs/api/api-conventions.md`).
 *
 * The one honest narrowing available is `/unread`, which is a **different
 * server-side endpoint** rather than a filter over the history — and it is
 * deliberately unpaged, so it stays unpaged here.
 */

/** `NotificationController.MAX_PAGE_SIZE` is 100; `@PageableDefault(size = 20)`. */
export const NOTIFICATION_PAGE_SIZE = 20;

export const notificationKeys = {
  all: ['notifications'] as const,
  history: () => [...notificationKeys.all, 'history'] as const,
  historyPage: (page: number) => [...notificationKeys.history(), page] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
  /**
   * The unread count is read by the bell AND by the dashboard tile, so the
   * query itself lives in `shared/notifications` — one endpoint, one cache
   * entry, one number on screen. This is that same key, still under
   * `notificationKeys.all`, so everything below (cancel, snapshot, restore,
   * invalidate) keeps covering it.
   */
  count: () => unreadCountKey,
};

// ── Reading ────────────────────────────────────────────────────────────────

export function useNotificationHistoryQuery(
  page: number,
): UseQueryResult<PageResponse<NotificationResponse>> {
  return useQuery({
    queryKey: notificationKeys.historyPage(page),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<PageResponse<NotificationResponse>>(
        '/api/hr/notifications',
        {
          signal,
          // No sort: the controller drops one, and sending it would imply the
          // ordering is ours to choose.
          params: toPageParams({ page, size: NOTIFICATION_PAGE_SIZE }),
        },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** The unpaged unread feed. Not a filter over the history — its own endpoint. */
export function useUnreadNotificationsQuery(
  enabled = true,
): UseQueryResult<NotificationResponse[]> {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<NotificationResponse[]>('/api/hr/notifications/unread', {
        signal,
      });
      return data;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Re-exported so the bell and the Notification Center still get their data from
 * one module. The query itself is `shared/notifications` — see
 * `notificationKeys.count` above for why it had to be promoted.
 */
export { UNREAD_COUNT_POLL_MS, useUnreadCountQuery } from '@/shared/notifications';

// ── Read state (the one place optimistic updates are allowed) ──────────────

/**
 * Snapshot of every cache a read-state change touches, so a failure restores
 * exactly what was there.
 */
interface ReadStateSnapshot {
  history: [readonly unknown[], PageResponse<NotificationResponse> | undefined][];
  unread: NotificationResponse[] | undefined;
  count: number | undefined;
}

function snapshot(queryClient: ReturnType<typeof useQueryClient>): ReadStateSnapshot {
  return {
    history: queryClient.getQueriesData<PageResponse<NotificationResponse>>({
      queryKey: notificationKeys.history(),
    }),
    unread: queryClient.getQueryData<NotificationResponse[]>(notificationKeys.unread()),
    count: queryClient.getQueryData<number>(notificationKeys.count()),
  };
}

function restore(
  queryClient: ReturnType<typeof useQueryClient>,
  previous: ReadStateSnapshot | undefined,
): void {
  if (!previous) return;
  for (const [key, value] of previous.history) {
    queryClient.setQueryData(key, value);
  }
  queryClient.setQueryData(notificationKeys.unread(), previous.unread);
  queryClient.setQueryData(notificationKeys.count(), previous.count);
}

/**
 * Mark one notification read — optimistic, which is allowed here and nowhere
 * else (FRONTEND-ARCHITECTURE §6). The reasons are specific to this mutation:
 * it is own-data, idempotent server-side, carries no business rule that could
 * reject it, and its only visible effect is a dot and a number. Approvals and
 * identity actions get none of that treatment, because a 409 there means
 * somebody else decided first.
 */
export function useMarkNotificationReadMutation(): UseMutationResult<
  NotificationResponse,
  unknown,
  string,
  ReadStateSnapshot
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch<NotificationResponse>(
        `/api/hr/notifications/${id}/read`,
      );
      return data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = snapshot(queryClient);

      // Only a notification that is genuinely unread changes the count; a
      // second mark-read on an already-read row is idempotent server-side and
      // must be idempotent here too, or the badge drifts below the truth.
      const wasUnread = previous.history.some(([, page]) =>
        page?.content.some((item) => item.id === id && !item.read),
      )
        ? true
        : (previous.unread?.some((item) => item.id === id) ?? false);

      queryClient.setQueriesData<PageResponse<NotificationResponse>>(
        { queryKey: notificationKeys.history() },
        (page) =>
          page
            ? {
                ...page,
                content: page.content.map((item) =>
                  item.id === id ? { ...item, read: true, status: 'READ' } : item,
                ),
              }
            : page,
      );
      queryClient.setQueryData<NotificationResponse[]>(notificationKeys.unread(), (list) =>
        list?.filter((item) => item.id !== id),
      );
      if (wasUnread) {
        queryClient.setQueryData<number>(notificationKeys.count(), (count) =>
          count === undefined ? count : Math.max(0, count - 1),
        );
      }
      return previous;
    },
    onError: (_error, _id, previous) => restore(queryClient, previous),
    // Reconcile with the server regardless of outcome: the optimistic value was
    // a guess about `readAt`, which only the server knows.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Mark everything read. The server answers with how many rows actually
 * changed — that number is reported, never assumed, because "marked 0 as read"
 * and "marked 12 as read" are different outcomes for the user.
 */
export function useMarkAllNotificationsReadMutation(): UseMutationResult<
  NotificationReadAllResponse,
  unknown,
  void,
  ReadStateSnapshot
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch<NotificationReadAllResponse>(
        '/api/hr/notifications/read-all',
      );
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = snapshot(queryClient);
      queryClient.setQueriesData<PageResponse<NotificationResponse>>(
        { queryKey: notificationKeys.history() },
        (page) =>
          page
            ? {
                ...page,
                content: page.content.map((item) => ({ ...item, read: true, status: 'READ' })),
              }
            : page,
      );
      queryClient.setQueryData<NotificationResponse[]>(notificationKeys.unread(), []);
      queryClient.setQueryData<number>(notificationKeys.count(), 0);
      return previous;
    },
    onError: (_error, _variables, previous) => restore(queryClient, previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
