package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/** Emitted when a provisioned employee's profile or status changed (Part 2 sync). */
public record EmployeeUpdated(
        UUID eventId,
        UUID aggregateId,
        UUID keycloakId,
        String email,
        String status,
        boolean enabled,
        String correlationId,
        Instant occurredAt) implements DomainEvent {

    public static EmployeeUpdated of(UUID employeeId, UUID keycloakId, String email, String status,
                                     boolean enabled, String correlationId) {
        return new EmployeeUpdated(UUID.randomUUID(), employeeId, keycloakId, email, status, enabled,
                correlationId, Instant.now());
    }

    @Override
    public String type() {
        return "employee.updated";
    }
}
