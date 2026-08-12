/**
 * Display names for `NotificationType.Category` — the coarse grouping the read
 * model carries on every notification.
 *
 * Presentation only. The category is not a filter here: `NotificationController`
 * accepts no category parameter, so there is nothing to send one to (see
 * `api/notifications-api.ts`). An unknown value falls through to the raw
 * literal rather than being hidden.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  LIFECYCLE: 'Account lifecycle',
  SECURITY: 'Security',
  LEAVE: 'Leave',
  EXPENSE: 'Expenses',
  DOCUMENT: 'Documents',
};
