package com.hub.expense.domain;

import java.util.UUID;

/** What expense needs to know about an employee — nothing more (§2.5). */
public record EmployeeSnapshot(
        UUID id,
        UUID keycloakId,
        boolean active,
        UUID managerId,
        UUID managerKeycloakId) {
}
