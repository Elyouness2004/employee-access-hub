package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Emitted when an employee is offboarded (P3.3). Downstream contexts
 * (leave/expense/documents) react to it (BR-05); hr-service also drives the
 * synchronous fan-out for the paths that must complete inside the request.
 */
public record EmployeeOffboarded(
        UUID eventId,
        UUID aggregateId,
        UUID keycloakId,
        String email,
        String correlationId,
        Instant occurredAt) implements DomainEvent {

    public static EmployeeOffboarded of(UUID employeeId, UUID keycloakId, String email,
                                        String correlationId) {
        return new EmployeeOffboarded(UUID.randomUUID(), employeeId, keycloakId, email,
                correlationId, Instant.now());
    }

    @Override
    public String type() {
        return "employee.offboarded";
    }
}
