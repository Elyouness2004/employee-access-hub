package com.hub.hr.infrastructure;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxEventTest {

    private OutboxEvent newEvent() {
        return new OutboxEvent(UUID.randomUUID(), UUID.randomUUID(), "employee.provisioned",
                "{}", "corr-1");
    }

    @Test
    void startsUnpublishedWithNoAttempts() {
        OutboxEvent event = newEvent();
        assertThat(event.isPublished()).isFalse();
        assertThat(event.getAttempts()).isZero();
    }

    @Test
    void markPublishedStampsTimeAndClearsError() {
        OutboxEvent event = newEvent();
        event.markFailed("boom");
        event.markPublished();
        assertThat(event.isPublished()).isTrue();
        assertThat(event.getPublishedAt()).isNotNull();
        assertThat(event.getLastError()).isNull();
        assertThat(event.getAttempts()).isEqualTo(2);
    }

    @Test
    void markFailedIncrementsAttemptsAndKeepsUnpublished() {
        OutboxEvent event = newEvent();
        event.markFailed("broker down");
        event.markFailed("still down");
        assertThat(event.isPublished()).isFalse();
        assertThat(event.getAttempts()).isEqualTo(2);
        assertThat(event.getLastError()).isEqualTo("still down");
    }
}
