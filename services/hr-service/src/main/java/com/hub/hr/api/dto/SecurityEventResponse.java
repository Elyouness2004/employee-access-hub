package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.infrastructure.SecurityEvent;

/** One security-event row (Part 6). */
public record SecurityEventResponse(
        UUID id,
        UUID keycloakId,
        String username,
        String type,
        String actor,
        String detail,
        Instant occurredAt) {

    public static SecurityEventResponse from(SecurityEvent event) {
        return new SecurityEventResponse(
                event.getId(),
                event.getKeycloakId(),
                event.getUsername(),
                event.getType(),
                event.getActor(),
                event.getDetail(),
                event.getOccurredAt());
    }
}
