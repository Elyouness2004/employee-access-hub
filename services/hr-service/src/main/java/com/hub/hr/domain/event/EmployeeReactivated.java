package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Emitted when a deactivated employee is reactivated: employment ACTIVE again and
 * the Keycloak account re-enabled. The reverse of {@link EmployeeDeactivated} and
 * the reason deactivation can be described to downstream contexts as a pause
 * rather than an ending.
 */
public record EmployeeReactivated(
        UUID eventId,
        UUID aggregateId,
        UUID keycloakId,
        String email,
        String realmRole,
        String correlationId,
        Instant occurredAt) implements DomainEvent {

    public static EmployeeReactivated of(UUID employeeId, UUID keycloakId, String email,
                                         String realmRole, String correlationId) {
        return new EmployeeReactivated(UUID.randomUUID(), employeeId, keycloakId, email, realmRole,
                correlationId, Instant.now());
    }

    @Override
    public String type() {
        return "employee.reactivated";
    }
}
