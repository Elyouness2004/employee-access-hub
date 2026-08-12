package com.hub.hr.domain.identity;

/**
 * Everything the identity provider needs to create an account for an employee
 * (P3.2). The username is the employee email; the account starts email-unverified
 * and with a forced password change.
 *
 * <p>{@code temporaryPassword} is {@code null} for the normal onboarding path:
 * the account is created with NO credential at all and the employee sets their
 * own through Keycloak's action-token e-mail. A password that is never generated
 * cannot be returned by an API, written to a log, or read out of an audit row —
 * which is the whole point. The field remains because the reset path still needs
 * to overwrite an existing credential with an unknown value to invalidate it.
 */
public record NewIdentity(
        String username,
        String email,
        String firstName,
        String lastName,
        String temporaryPassword,
        String realmRole,
        boolean emailVerified,
        boolean requirePasswordUpdate) {

    /** Onboarding identity: no credential, password update forced at first sign-in. */
    public static NewIdentity withoutCredential(String username, String email, String firstName,
                                                String lastName, String realmRole) {
        return new NewIdentity(username, email, firstName, lastName, null, realmRole, false, true);
    }

    public boolean hasCredential() {
        return temporaryPassword != null && !temporaryPassword.isBlank();
    }
}
