import { Check } from 'lucide-react';

import { Button, Spinner } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import type { NotificationResponse } from '@/shared/types/hr';

import { CATEGORY_LABELS } from '../categories';

/**
 * One notification (DESIGN-SYSTEM §11.3).
 *
 * **The copy is the backend's.** `title` and `message` come from
 * `NotificationType`, which is the single source both the in-process generation
 * and the event consumer draw on. Re-wording them here would give the same
 * event two different descriptions depending on which surface you read it on,
 * so they are rendered verbatim.
 *
 * Unread is marked three ways at once — a dot, a stronger title, and the word
 * "Unread" for assistive tech — because the design system forbids status
 * carried by colour alone (§2.4 gives unread an info dot *and* a strong title).
 */
export interface NotificationItemProps {
  notification: NotificationResponse;
  onMarkRead?: (id: string) => void;
  isMarking?: boolean;
}

export function NotificationItem({ notification, onMarkRead, isMarking }: NotificationItemProps) {
  const isUnread = !notification.read;
  const category = CATEGORY_LABELS[notification.category] ?? notification.category;

  return (
    <li className="flex items-start gap-3 border-b border-border p-4 last:border-0">
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          isUnread ? 'bg-status-info-text' : 'bg-transparent',
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className={cn('text-panel-title', isUnread ? 'text-ink-strong' : 'text-ink')}>
            {notification.title}
          </p>
          {isUnread ? <span className="sr-only">Unread</span> : null}
          <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-caption text-ink-muted">
            {category}
          </span>
        </div>
        <p className="text-body text-ink">{notification.message}</p>
        <p className="flex flex-wrap gap-x-3 text-caption text-ink-muted">
          <span className="tabular-nums">{formatDateTime(notification.createdAt)}</span>
          {/* The machine event code: what you paste into a log query. */}
          <span className="font-mono text-mono-sm">{notification.type}</span>
          {notification.readAt ? (
            <span className="tabular-nums">Read {formatDateTime(notification.readAt)}</span>
          ) : null}
        </p>
      </div>
      {isUnread && onMarkRead ? (
        <Button
          variant="ghost"
          size="compact"
          className="shrink-0"
          disabled={isMarking}
          onClick={() => onMarkRead(notification.id)}
        >
          {isMarking ? <Spinner /> : <Check aria-hidden="true" />}
          Mark read
          <span className="sr-only"> — {notification.title}</span>
        </Button>
      ) : null}
    </li>
  );
}
