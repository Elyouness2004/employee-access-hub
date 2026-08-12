package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.infrastructure.OutboxEvent;

/** One emitted event as seen in the outbox (Part 5 — internal events API). */
public record OutboxEventResponse(
        UUID id,
        UUID aggregateId,
        String type,
        String correlationId,
        Instant createdAt,
        Instant publishedAt,
        int attempts) {

    public static OutboxEventResponse from(OutboxEvent event) {
        return new OutboxEventResponse(
                event.getId(),
                event.getAggregateId(),
                event.getType(),
                event.getCorrelationId(),
                event.getCreatedAt(),
                event.getPublishedAt(),
                event.getAttempts());
    }
}
