package com.hub.hr.application;

import java.util.UUID;

/**
 * Result of an onboarding attempt returned to the API layer.
 *
 * <p>{@code accountCreated} distinguishes a new Keycloak account from one that
 * already existed and was adopted, and {@code activationEmailSent} says whether
 * the employee actually received the password-setup link. Both are outcomes an
 * operator has to act on — an adopted account keeps its existing credential, and
 * an undelivered activation means somebody has to be told another way — so
 * neither is flattened into a single "provisioned" boolean. No credential of any
 * kind appears here: none is created.
 */
public record ProvisioningOutcome(UUID employeeId, UUID keycloakId, String realmRole,
                                  boolean alreadyProvisioned, boolean accountCreated,
                                  boolean activationEmailSent) {

    /** The idempotent no-op: this employee already has a healthy linked account. */
    public static ProvisioningOutcome alreadyProvisioned(UUID employeeId, UUID keycloakId, String realmRole) {
        return new ProvisioningOutcome(employeeId, keycloakId, realmRole, true, false, false);
    }
}
