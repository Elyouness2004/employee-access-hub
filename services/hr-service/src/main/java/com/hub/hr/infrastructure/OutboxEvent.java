package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Transactional outbox row (Part 4). Written in the same transaction as the
 * state change (at-least-once source of truth); {@code publishedAt} is stamped
 * once the relay hands it to the broker, and {@code attempts}/{@code lastError}
 * drive the retry policy. The primary key is the event id, so a redelivery /
 * re-enqueue is naturally de-duplicated.
 */
@Entity
@Table(name = "event_outbox")
public class OutboxEvent {

    @Id
    private UUID id;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(nullable = false, length = 60)
    private String type;

    @Column(nullable = false, length = 4000)
    private String payload;

    @Column(name = "correlation_id", nullable = false, length = 64)
    private String correlationId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 2000)
    private String lastError;

    protected OutboxEvent() {
        // JPA only
    }

    public OutboxEvent(UUID id, UUID aggregateId, String type, String payload, String correlationId) {
        this.id = id;
        this.aggregateId = aggregateId;
        this.type = type;
        this.payload = payload;
        this.correlationId = correlationId;
        this.createdAt = Instant.now();
        this.attempts = 0;
    }

    /** Stamp a successful hand-off to the broker. */
    public void markPublished() {
        this.publishedAt = Instant.now();
        this.attempts++;
        this.lastError = null;
    }

    /** Record a failed delivery attempt (kept unpublished for the next relay pass). */
    public void markFailed(String error) {
        this.attempts++;
        this.lastError = error != null && error.length() > 2000 ? error.substring(0, 2000) : error;
    }

    public boolean isPublished() {
        return publishedAt != null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAggregateId() {
        return aggregateId;
    }

    public String getType() {
        return type;
    }

    public String getPayload() {
        return payload;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public String getLastError() {
        return lastError;
    }
}
