import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { IconButton } from '@/shared/components/ui';

/**
 * The countless top-bar bell: a link to the notification center and nothing
 * else.
 *
 * The live version is `NotificationBell` in `features/notifications`, which
 * polls `GET /api/hr/notifications/count`. `shared/*` may not import a feature
 * (FRONTEND-ARCHITECTURE §14), so `AppShell` injects that one through
 * `AppHeader`'s `notifications` slot and this stays the fallback — used when
 * the shell is rendered without it (component tests of the header itself).
 * Showing no number is the point: a zero here would claim nothing is waiting.
 */
export function NotificationTrigger() {
  return (
    <IconButton asChild label="Notifications">
      <Link to="/notifications">
        <Bell aria-hidden="true" />
      </Link>
    </IconButton>
  );
}
