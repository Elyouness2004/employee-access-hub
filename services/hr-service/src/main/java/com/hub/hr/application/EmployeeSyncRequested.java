package com.hub.hr.application;

import java.util.UUID;

/**
 * Internal signal published by {@link EmployeeService} when a provisioned
 * employee's identity-relevant fields (email, name, status) change, so the
 * Keycloak account is synchronized AFTER the update transaction commits.
 */
public record EmployeeSyncRequested(UUID employeeId, String correlationId) {
}
