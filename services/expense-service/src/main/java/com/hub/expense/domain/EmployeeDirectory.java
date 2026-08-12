package com.hub.expense.domain;

import java.util.Optional;
import java.util.UUID;

/**
 * Port to the HR bounded context (§2.5). Implementations must degrade
 * gracefully: serve a cached snapshot while HR is down, and throw
 * {@link HrDirectoryUnavailableException} only when nothing cached exists.
 */
public interface EmployeeDirectory {

    /** Resolve by Keycloak subject ({@code jwt.sub}) — the identity link. */
    Optional<EmployeeSnapshot> findByKeycloakId(UUID keycloakId);

    /** Resolve by HR employee id. */
    Optional<EmployeeSnapshot> findById(UUID employeeId);
}
