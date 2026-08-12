package com.hub.hr.application;

import java.util.UUID;

/**
 * A security/admin identity action was requested for an employee that has no
 * linked Keycloak account yet. Surfaces as 409 — the request conflicts with the
 * employee's current provisioning state; onboarding must run first.
 */
public class EmployeeNotProvisionedException extends RuntimeException {

    public EmployeeNotProvisionedException(UUID employeeId) {
        super("employee " + employeeId + " has no linked identity; provision it first");
    }
}
