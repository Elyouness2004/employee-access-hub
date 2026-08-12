package com.hub.hr.api.dto;

/** The caller's unread-notification count (badge). */
public record NotificationCountResponse(long unread) {

    public static NotificationCountResponse of(long unread) {
        return new NotificationCountResponse(unread);
    }
}
