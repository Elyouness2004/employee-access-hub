package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/**
 * A lifecycle event carried by the event fabric (Part 4). Sealed so the outbox
 * and broker adapters can exhaustively handle the known types. Every event has a
 * stable {@code eventId} (idempotency key for at-least-once consumers), the
 * {@code aggregateId} (employee id) it concerns, a {@code correlationId} to
 * trace the originating request across services, and its own {@code occurredAt}.
 */
public sealed interface DomainEvent
        permits EmployeeProvisioned, EmployeeUpdated, EmployeeDeactivated,
                EmployeeReactivated, EmployeeOffboarded {

    UUID eventId();

    UUID aggregateId();

    UUID keycloakId();

    String correlationId();

    Instant occurredAt();

    /** Routing key / stored type, e.g. {@code employee.provisioned}. */
    String type();
}
