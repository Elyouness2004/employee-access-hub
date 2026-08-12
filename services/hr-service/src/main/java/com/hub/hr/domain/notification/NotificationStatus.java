package com.hub.hr.domain.notification;

/**
 * Read/unread state of a {@link Notification} — the only mutable business fact on
 * the aggregate. UNREAD on creation; a mark-read transition sets READ once and is
 * idempotent (a second read never changes anything else).
 */
public enum NotificationStatus {
    UNREAD,
    READ
}
