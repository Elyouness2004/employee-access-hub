package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Emitted when an employee is deactivated: employment DISABLED, Keycloak account
 * disabled, sessions revoked — and reversible, which is exactly what separates it
 * from {@link EmployeeOffboarded}.
 *
 * <p>Downstream contexts must treat the two differently. Offboarding closes work
 * out (BR-05 cancels pending leave and open claims); a deactivation is a pause,
 * so the person's records stay as they are and simply become unreachable while
 * the account is disabled. Publishing one event for both would force every
 * consumer to guess which of those two very different things happened.
 */
public record EmployeeDeactivated(
        UUID eventId,
        UUID aggregateId,
        UUID keycloakId,
        String email,
        String reason,
        String correlationId,
        Instant occurredAt) implements DomainEvent {

    public static EmployeeDeactivated of(UUID employeeId, UUID keycloakId, String email,
                                         String reason, String correlationId) {
        return new EmployeeDeactivated(UUID.randomUUID(), employeeId, keycloakId, email, reason,
                correlationId, Instant.now());
    }

    @Override
    public String type() {
        return "employee.deactivated";
    }
}
