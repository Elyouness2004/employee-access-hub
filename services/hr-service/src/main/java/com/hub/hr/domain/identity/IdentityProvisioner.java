package com.hub.hr.domain.identity;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Port to the identity provider's admin surface (Keycloak Admin REST). Kept in
 * the domain so the application services depend on the abstraction, not on
 * Keycloak: the real adapter is config-gated (needs a running Keycloak), the
 * default logs its intent so the service runs without one, and tests use a
 * recording fake. Every method may throw {@link IdentityUnavailableException}
 * when the provider cannot be reached.
 *
 * <p>Everything credential-shaped stays on the provider's side of this port.
 * There is no "read the password" operation because no password is ever created
 * here: an account is provisioned WITHOUT a credential and the employee sets
 * their own through Keycloak's action-token flow ({@link #sendActionsEmail}).
 */
public interface IdentityProvisioner {

    /** Create the account and return the provider's user id (Keycloak UUID). */
    UUID createUser(NewIdentity identity);

    /**
     * The provider's id for an existing account matching this identifier, by
     * username <b>or</b> e-mail. The duplicate guard for provisioning: an employee
     * whose account already exists in Keycloak (a re-run, a pre-seeded user, a
     * link lost after a partial failure) is adopted rather than created twice.
     *
     * <p>Both fields are searched because they routinely disagree. Accounts this
     * service creates use the e-mail as the username, but an account created any
     * other way — the seeded {@code alice.employee}, anything from an earlier
     * import — has a short username and the same e-mail. Searching only the
     * username would miss it and attempt a create, which Keycloak then refuses
     * because the realm forbids duplicate e-mails: the employee would be stuck
     * unprovisionable with a failure that no amount of retrying could clear.
     */
    Optional<UUID> findAccount(String usernameOrEmail);

    /** Realm roles currently held by the account — the input to role synchronization. */
    Set<String> realmRolesOf(UUID keycloakId);

    /** Grant a realm role to the account. */
    void assignRealmRole(UUID keycloakId, String realmRole);

    /**
     * Revoke a realm role. Needed because role synchronization must be a
     * replacement, not an accumulation: an employee who stops managing people
     * has to LOSE {@code MANAGER}, not merely gain {@code EMPLOYEE} beside it.
     */
    void removeRealmRole(UUID keycloakId, String realmRole);

    /** Push profile + enabled state to the account (identity synchronization). */
    void updateUser(UUID keycloakId, String email, String firstName, String lastName, boolean enabled);

    /** Enable or disable the account (offboarding, lock/unlock). */
    void setEnabled(UUID keycloakId, boolean enabled);

    /** Reset the password, optionally forcing a change on next login. */
    void resetPassword(UUID keycloakId, String password, boolean temporary);

    /**
     * Add a Keycloak required action the account must complete at next sign-in
     * ({@code UPDATE_PASSWORD}, {@code CONFIGURE_TOTP}). Additive: existing
     * pending actions are preserved.
     */
    void addRequiredAction(UUID keycloakId, String action);

    /**
     * Ask Keycloak to e-mail the account an action token for the given required
     * actions — its own password-setup / MFA-enrolment form. The link is minted,
     * carried and consumed entirely by Keycloak; this service never sees it.
     *
     * @throws ActivationDeliveryException when the provider accepted the request
     *         but could not deliver the mail (SMTP unset or unreachable). That is
     *         a partial outcome to report, never a reason to fail the account
     *         operation that triggered it.
     */
    void sendActionsEmail(UUID keycloakId, List<String> actions);

    /**
     * Clear the provider's brute-force lockout for the account. An account
     * temporarily locked by failed sign-ins is enabled but unable to
     * authenticate, so unlocking has to clear this as well as the enabled flag.
     */
    void clearBruteForce(UUID keycloakId);

    /**
     * Kill all SSO sessions and revoke refresh tokens (session invalidation +
     * refresh-token revocation, Part 6). Residual access is bounded to the
     * access-token lifetime — the core secure-offboarding argument.
     */
    void logoutAllSessions(UUID keycloakId);

    /** Compensating delete used to roll back a half-created account on failure. */
    void deleteUser(UUID keycloakId);
}
