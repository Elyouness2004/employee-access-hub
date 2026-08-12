import { BellOff, CheckCheck, Inbox } from 'lucide-react';
import { useState } from 'react';

import {
  EmptyState,
  PageContainer,
  PageHeader,
  PaginationControls,
  QueryStateBoundary,
} from '@/shared/components';
import { Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';
import { useUrlFilters } from '@/shared/hooks/use-url-filters';
import type { NotificationResponse } from '@/shared/types/hr';

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationHistoryQuery,
  useUnreadNotificationsQuery,
} from '../api/notifications-api';
import { NotificationItem } from '../components/NotificationItem';

/**
 * P12 — Notification Center (`/notifications`). Every authenticated role.
 *
 * **Two views, both server-side.** "All" is the paged history; "Unread" is the
 * separate `/unread` endpoint, which is deliberately unpaged (api-conventions
 * §1 lists it among the fixed-purpose feeds) and stays that way. They are not a
 * filter and its inverse — they are two endpoints, and the page treats them as
 * such: each has its own empty state, its own loading state and its own failure.
 *
 * There is no search box, no sort control and no category filter, because
 * `NotificationController` accepts none of them. The absence is stated on the
 * page rather than papered over with client-side filtering of one fetched page.
 *
 * **With the event broker off — the default configuration — only LIFECYCLE and
 * SECURITY notifications exist**, because those are the ones hr-service raises
 * in-process. Leave, expense and document notifications are published by other
 * bounded contexts and only arrive once the broker is on. An employee seeing
 * none of them is looking at correct behaviour, and the empty state says so
 * instead of implying something is broken.
 */
const NO_FILTER_KEYS = [] as const;

type View = 'all' | 'unread';

export function NotificationsPage() {
  const { page, setPage } = useUrlFilters({ keys: NO_FILTER_KEYS });
  // Which view is open lives in the URL alongside the page, so a link to
  // "my unread notifications" is a link (FRONTEND-SPECIFICATION §3).
  const [view, setView] = useUrlView();

  const history = useNotificationHistoryQuery(page);
  const unread = useUnreadNotificationsQuery(view === 'unread');
  const markRead = useMarkNotificationReadMutation();
  const markAll = useMarkAllNotificationsReadMutation();
  const [markAllOutcome, setMarkAllOutcome] = useState<string | null>(null);

  const onMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  const onMarkAll = () => {
    setMarkAllOutcome(null);
    markAll.mutate(undefined, {
      // The server says how many rows actually changed; reporting our own
      // guess would claim work that may not have happened.
      onSuccess: (result) =>
        setMarkAllOutcome(
          result.markedRead === 0
            ? 'Nothing to mark — everything was already read.'
            : `Marked ${result.markedRead} notification${result.markedRead === 1 ? '' : 's'} as read.`,
        ),
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="What the platform recorded about your account. The wording comes from the event that raised it."
        actions={
          <Button variant="secondary" loading={markAll.isPending} onClick={onMarkAll}>
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Announced once, because the user does not watch rows change. */}
        <p aria-live="polite" className="empty:hidden text-body-secondary text-ink-muted">
          {markAllOutcome}
        </p>

        {markAll.isError ? <QueryStateBoundary error={markAll.error} onRetry={onMarkAll} /> : null}

        <Tabs value={view} onValueChange={(next) => setView(next as View)}>
          <TabsList>
            <TabsTrigger value="all">All notifications</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <NotificationFeed
              caption="All notifications"
              items={history.data?.content}
              isLoading={history.isPending}
              error={history.error}
              onRetry={() => void history.refetch()}
              onMarkRead={onMarkRead}
              markingId={markRead.isPending ? markRead.variables : undefined}
              empty={
                <EmptyState
                  icon={Inbox}
                  title="No notifications yet"
                  description="Account, security and lifecycle events land here as they happen. With the event broker off — the default setup — leave, expense and document notifications are not delivered at all, which is expected rather than a fault."
                />
              }
              footer={
                history.data ? (
                  <PaginationControls
                    page={history.data}
                    onPageChange={setPage}
                    label="notifications"
                  />
                ) : null
              }
            />
          </TabsContent>

          <TabsContent value="unread">
            <NotificationFeed
              caption="Unread notifications"
              items={unread.data}
              isLoading={unread.isPending}
              error={unread.error}
              onRetry={() => void unread.refetch()}
              onMarkRead={onMarkRead}
              markingId={markRead.isPending ? markRead.variables : undefined}
              empty={
                <EmptyState
                  icon={BellOff}
                  title="Nothing unread"
                  description="You have read everything. New notifications will appear here as events happen on your account."
                />
              }
              footer={
                <p className="border-t border-border px-4 py-3 text-caption text-ink-muted">
                  The unread feed is not paged — this endpoint returns every unread notification at
                  once, newest first.
                </p>
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}

function NotificationFeed({
  caption,
  items,
  isLoading,
  error,
  onRetry,
  onMarkRead,
  markingId,
  empty,
  footer,
}: {
  caption: string;
  items: NotificationResponse[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onMarkRead: (id: string) => void;
  markingId: string | undefined;
  empty: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (error) return <QueryStateBoundary error={error} onRetry={onRetry} />;
  if (isLoading && !items) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <span className="sr-only">Loading {caption}</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (!items) return null;
  if (items.length === 0) return <>{empty}</>;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <ul aria-label={caption}>
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={onMarkRead}
            isMarking={markingId === notification.id}
          />
        ))}
      </ul>
      {footer}
    </div>
  );
}

/**
 * The open view as a URL parameter. `useUrlFilters` owns page/sort/search/filters
 * and this is none of those — it selects which endpoint the page is reading —
 * so it gets its own small binding rather than being smuggled in as a "filter"
 * that never reaches the server.
 */
function useUrlView(): [View, (next: View) => void] {
  const { filters, setFilter } = useUrlFilters({ keys: ['view'] as const });
  const view: View = filters.view === 'unread' ? 'unread' : 'all';
  return [view, (next: View) => setFilter('view', next === 'all' ? undefined : next)];
}
