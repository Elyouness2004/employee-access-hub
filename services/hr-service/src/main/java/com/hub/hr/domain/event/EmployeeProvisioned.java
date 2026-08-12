package com.hub.hr.domain.event;

import java.time.Instant;
import java.util.UUID;

/** Emitted after an employee is successfully provisioned into Keycloak (P3.2). */
public record EmployeeProvisioned(
        UUID eventId,
        UUID aggregateId,
        UUID keycloakId,
        String email,
        String realmRole,
        String correlationId,
        Instant occurredAt) implements DomainEvent {

    public static EmployeeProvisioned of(UUID employeeId, UUID keycloakId, String email,
                                         String realmRole, String correlationId) {
        return new EmployeeProvisioned(UUID.randomUUID(), employeeId, keycloakId, email, realmRole,
                correlationId, Instant.now());
    }

    @Override
    public String type() {
        return "employee.provisioned";
    }
}
