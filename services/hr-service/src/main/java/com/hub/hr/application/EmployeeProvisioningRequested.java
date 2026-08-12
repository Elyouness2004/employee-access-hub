package com.hub.hr.application;

import java.util.UUID;

/**
 * Internal signal published by {@link EmployeeService} when an employee becomes
 * ACTIVE, so onboarding runs automatically AFTER the create/update transaction
 * commits (the row must be visible before the identity provider is called).
 */
public record EmployeeProvisioningRequested(UUID employeeId, String correlationId) {
}
