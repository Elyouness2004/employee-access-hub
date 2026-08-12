import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { IconButton } from '@/shared/components/ui';

import { useUnreadCountQuery } from '../api/notifications-api';

/**
 * The top-bar bell (DESIGN-SYSTEM §11.3): unread count, polled every 60s, and a
 * link to the center.
 *
 * **The count is never faked, and "unknown" is never zero.** If
 * `/notifications/count` fails or has not answered yet, the bell shows no
 * number at all and says so in its accessible name. A zero pill would report
 * "you have nothing waiting" on the strength of a failed request — precisely
 * the class of lie DESIGN-SYSTEM §12 rejects when it forbids rendering absent
 * data as 0.
 *
 * The pill caps its *display* at 99+ while the accessible name keeps the real
 * figure: a truncated glyph is a layout decision and must not truncate the fact.
 */
export function NotificationBell() {
  const { data: unread, isError } = useUnreadCountQuery();

  const label =
    unread === undefined
      ? isError
        ? 'Notifications — unread count unavailable'
        : 'Notifications'
      : unread === 0
        ? 'Notifications — nothing unread'
        : `Notifications — ${unread} unread`;

  return (
    <IconButton asChild label={label}>
      <Link to="/notifications" className="relative">
        <Bell aria-hidden="true" />
        {unread !== undefined && unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-status-info-text px-1 text-center text-caption font-medium tabular-nums text-surface"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    </IconButton>
  );
}
