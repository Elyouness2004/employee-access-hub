package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;

/**
 * One notification as the Notification Center renders it. Exposes what the read
 * model needs — type, its {@code category} (grouping/colour), read state, copy and
 * timestamps. Owner-internal fields (recipient, employee id, correlation id) are
 * deliberately not surfaced, mirroring how {@code AuditEntryResponse} omits its
 * internal columns.
 */
public record NotificationResponse(
        UUID id,
        String type,
        String category,
        String status,
        boolean read,
        String title,
        String message,
        Instant createdAt,
        Instant readAt) {

    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType().name(),
                notification.getType().category().name(),
                notification.getStatus().name(),
                !notification.isUnread(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getCreatedAt(),
                notification.getReadAt());
    }
}
