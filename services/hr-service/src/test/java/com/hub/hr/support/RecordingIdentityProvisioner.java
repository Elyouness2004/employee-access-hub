package com.hub.hr.support;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import com.hub.hr.domain.identity.ActivationDeliveryException;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.identity.IdentityUnavailableException;
import com.hub.hr.domain.identity.NewIdentity;

/**
 * Test double for the identity provider: records every call so tests can assert
 * the exact Keycloak interactions, and can be told to fail a given operation to
 * exercise the rollback / eventual-consistency paths — without a real Keycloak.
 *
 * <p>It keeps real state for the things provisioning now reads back — which
 * usernames exist, and which realm roles an account holds — because a fake that
 * always answers "no such user" and "no roles" would make the adopt-an-existing
 * -account path and the role-replacement path pass without ever exercising them.
 */
public class RecordingIdentityProvisioner implements IdentityProvisioner {

    public final List<NewIdentity> created = new CopyOnWriteArrayList<>();
    public final List<String> assignedRoles = new CopyOnWriteArrayList<>();
    public final List<String> revokedRoles = new CopyOnWriteArrayList<>();
    public final List<UUID> deleted = new CopyOnWriteArrayList<>();
    public final List<UUID> disabled = new CopyOnWriteArrayList<>();
    public final List<UUID> enabled = new CopyOnWriteArrayList<>();
    public final List<UUID> loggedOut = new CopyOnWriteArrayList<>();
    public final List<UUID> passwordResets = new CopyOnWriteArrayList<>();
    public final List<UUID> updated = new CopyOnWriteArrayList<>();
    public final List<UUID> bruteForceCleared = new CopyOnWriteArrayList<>();
    public final List<String> requiredActions = new CopyOnWriteArrayList<>();
    public final List<List<String>> actionEmails = new CopyOnWriteArrayList<>();

    /** Accounts the provider already knows, keyed by lower-cased username AND e-mail. */
    public final Map<String, UUID> existingAccounts = new ConcurrentHashMap<>();
    /** Realm roles held per account — seed it to exercise role replacement. */
    public final Map<UUID, Set<String>> rolesByAccount = new ConcurrentHashMap<>();

    public volatile boolean failOnCreate = false;
    public volatile boolean failOnAssignRole = false;
    public volatile boolean failOnUpdate = false;
    /** Simulates SMTP being unconfigured or down: the account is fine, the mail is not. */
    public volatile boolean failOnActionEmail = false;

    public void reset() {
        created.clear();
        assignedRoles.clear();
        revokedRoles.clear();
        deleted.clear();
        disabled.clear();
        enabled.clear();
        loggedOut.clear();
        passwordResets.clear();
        updated.clear();
        bruteForceCleared.clear();
        requiredActions.clear();
        actionEmails.clear();
        existingAccounts.clear();
        rolesByAccount.clear();
        failOnCreate = false;
        failOnAssignRole = false;
        failOnUpdate = false;
        failOnActionEmail = false;
    }

    /** Pre-seed an account whose username and e-mail are the same value. */
    public UUID givenExistingAccount(String username, String... realmRoles) {
        return givenExistingAccountWithEmail(username, username, realmRoles);
    }

    /**
     * Pre-seed an account whose username and e-mail DIFFER — the shape of the
     * realm's seeded users (`alice.employee` / `alice.employee@hub.local`), and
     * the case that breaks a username-only lookup.
     */
    public UUID givenExistingAccountWithEmail(String username, String email, String... realmRoles) {
        UUID id = UUID.randomUUID();
        existingAccounts.put(username.toLowerCase(Locale.ROOT), id);
        existingAccounts.put(email.toLowerCase(Locale.ROOT), id);
        rolesByAccount.put(id, ConcurrentHashMap.newKeySet());
        rolesByAccount.get(id).addAll(List.of(realmRoles));
        return id;
    }

    @Override
    public UUID createUser(NewIdentity identity) {
        created.add(identity);
        if (failOnCreate) {
            throw new IdentityUnavailableException("createUser failed (test)");
        }
        UUID id = UUID.randomUUID();
        existingAccounts.put(identity.username().toLowerCase(Locale.ROOT), id);
        rolesByAccount.put(id, ConcurrentHashMap.newKeySet());
        return id;
    }

    @Override
    public Optional<UUID> findAccount(String usernameOrEmail) {
        return Optional.ofNullable(existingAccounts.get(usernameOrEmail.toLowerCase(Locale.ROOT)));
    }

    @Override
    public Set<String> realmRolesOf(UUID keycloakId) {
        return Set.copyOf(rolesByAccount.getOrDefault(keycloakId, Set.of()));
    }

    @Override
    public void assignRealmRole(UUID keycloakId, String realmRole) {
        if (failOnAssignRole) {
            throw new IdentityUnavailableException("assignRealmRole failed (test)");
        }
        assignedRoles.add(realmRole);
        rolesByAccount.computeIfAbsent(keycloakId, id -> ConcurrentHashMap.newKeySet()).add(realmRole);
    }

    @Override
    public void removeRealmRole(UUID keycloakId, String realmRole) {
        revokedRoles.add(realmRole);
        rolesByAccount.getOrDefault(keycloakId, ConcurrentHashMap.newKeySet()).remove(realmRole);
    }

    @Override
    public void updateUser(UUID keycloakId, String email, String firstName, String lastName, boolean enabledFlag) {
        if (failOnUpdate) {
            throw new IdentityUnavailableException("updateUser failed (test)");
        }
        updated.add(keycloakId);
        (enabledFlag ? enabled : disabled).add(keycloakId);
    }

    @Override
    public void setEnabled(UUID keycloakId, boolean enabledFlag) {
        (enabledFlag ? enabled : disabled).add(keycloakId);
    }

    @Override
    public void resetPassword(UUID keycloakId, String password, boolean temporary) {
        passwordResets.add(keycloakId);
    }

    @Override
    public void addRequiredAction(UUID keycloakId, String action) {
        requiredActions.add(action);
    }

    @Override
    public void sendActionsEmail(UUID keycloakId, List<String> actions) {
        if (failOnActionEmail) {
            throw new ActivationDeliveryException("no SMTP (test)");
        }
        actionEmails.add(List.copyOf(actions));
    }

    @Override
    public void clearBruteForce(UUID keycloakId) {
        bruteForceCleared.add(keycloakId);
    }

    @Override
    public void logoutAllSessions(UUID keycloakId) {
        loggedOut.add(keycloakId);
    }

    @Override
    public void deleteUser(UUID keycloakId) {
        deleted.add(keycloakId);
        new LinkedHashMap<>(existingAccounts).forEach((identifier, id) -> {
            if (id.equals(keycloakId)) {
                existingAccounts.remove(identifier);
            }
        });
        rolesByAccount.remove(keycloakId);
    }
}
