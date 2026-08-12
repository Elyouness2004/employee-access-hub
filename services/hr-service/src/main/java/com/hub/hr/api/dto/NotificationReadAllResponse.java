package com.hub.hr.api.dto;

/** Result of a mark-all-read: how many notifications actually transitioned to read. */
public record NotificationReadAllResponse(int markedRead) {

    public static NotificationReadAllResponse of(int markedRead) {
        return new NotificationReadAllResponse(markedRead);
    }
}
