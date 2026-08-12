package com.hub.hr.domain;

/**
 * Identity-provisioning state of an employee record (E04, Day 6), tracked on the
 * aggregate alongside {@link EmployeeStatus}. NOT_PROVISIONED until onboarding
 * links a Keycloak account; FAILED when a provisioning attempt could not
 * complete (re-provision is then allowed); LOCKED after an admin account lock.
 */
public enum ProvisioningStatus {
    NOT_PROVISIONED,
    PROVISIONED,
    FAILED,
    DISABLED,
    LOCKED
}
