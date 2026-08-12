/**
 * Public surface of the notifications feature (P12 center + the top-bar bell).
 *
 * The bell is exported because the shell renders it: `shared/components` may
 * not import a feature, so `app/layouts/AppShell` composes it into the header
 * through a slot — the same direction every other feature-into-shell wiring
 * takes.
 */
export { NotificationsPage } from './pages/NotificationsPage';
export { NotificationBell } from './components/NotificationBell';
export { notificationKeys, useUnreadCountQuery } from './api/notifications-api';
