package com.hub.leave.domain;

import java.util.UUID;

/** What leave needs to know about an employee — nothing more (§2.5). */
public record EmployeeSnapshot(
        UUID id,
        UUID keycloakId,
        boolean active,
        UUID managerId,
        UUID managerKeycloakId) {
}
