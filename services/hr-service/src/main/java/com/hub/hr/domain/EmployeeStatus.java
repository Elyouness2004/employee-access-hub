package com.hub.hr.domain;

/**
 * Coarse lifecycle state. DISABLED (added in the CRUD contract from day one) is
 * the deactivated / "inactive" state — the Keycloak account is disabled but the
 * record may return to ACTIVE. TERMINATED (E04, Day 6) is the offboarding
 * terminal state. Both map to a disabled Keycloak account (enabled=false); only
 * ACTIVE keeps the account enabled.
 */
public enum EmployeeStatus {
    ACTIVE,
    DISABLED,
    TERMINATED;

    /** Whether the linked Keycloak account should be enabled for this status. */
    public boolean keycloakEnabled() {
        return this == ACTIVE;
    }
}
