package com.hub.hr.infrastructure;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import com.hub.hr.domain.identity.ActivationDeliveryException;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.identity.NewIdentity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Default identity adapter: records the intended Keycloak operation and, for
 * {@code createUser}, mints a synthetic id — so the whole lifecycle (onboarding,
 * sync, offboarding, events, audit) runs end-to-end WITHOUT a Keycloak instance.
 * The real adapter ({@link KeycloakAdminIdentityProvisioner}) takes over when
 * {@code hub.identity.keycloak.enabled=true}. Every account MUTATION succeeds, so
 * it also stands in for the "provider available" path in tests that don't inject a
 * fake. The one exception is {@link #sendActionsEmail}: sending needs a real
 * provider, and pretending otherwise is what made the API report
 * {@code activationEmailSent=true} with no mail server in sight.
 *
 * <p>It keeps an in-memory username → id map so that {@link #findByUsername} and
 * {@link #realmRolesOf} answer consistently with what {@code createUser} did.
 * Without that, the adopt-an-existing-account path would be untestable on the
 * no-Keycloak profile: every provisioning would look like a first one.
 */
@Component
@ConditionalOnProperty(name = "hub.identity.keycloak.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingIdentityProvisioner implements IdentityProvisioner {

    private static final Logger log = LoggerFactory.getLogger(LoggingIdentityProvisioner.class);

    /** Keyed by BOTH username and e-mail, lower-cased — as Keycloak is searchable. */
    private final Map<String, UUID> accountsByIdentifier = new ConcurrentHashMap<>();
    private final Map<UUID, Set<String>> realmRoles = new ConcurrentHashMap<>();

    @Override
    public UUID createUser(NewIdentity identity) {
        UUID id = accountsByIdentifier.computeIfAbsent(
                identity.username().toLowerCase(java.util.Locale.ROOT), key -> UUID.randomUUID());
        accountsByIdentifier.putIfAbsent(identity.email().toLowerCase(java.util.Locale.ROOT), id);
        log.info("[identity] createUser username={} role={} credential={} requirePasswordUpdate={} -> {}",
                identity.username(), identity.realmRole(),
                identity.hasCredential() ? "set" : "none", identity.requirePasswordUpdate(), id);
        return id;
    }

    @Override
    public Optional<UUID> findAccount(String usernameOrEmail) {
        return Optional.ofNullable(accountsByIdentifier.get(usernameOrEmail.toLowerCase(java.util.Locale.ROOT)));
    }

    @Override
    public Set<String> realmRolesOf(UUID keycloakId) {
        return Set.copyOf(realmRoles.getOrDefault(keycloakId, Set.of()));
    }

    @Override
    public void assignRealmRole(UUID keycloakId, String realmRole) {
        realmRoles.computeIfAbsent(keycloakId, id -> ConcurrentHashMap.newKeySet()).add(realmRole);
        log.info("[identity] assignRealmRole {} role={}", keycloakId, realmRole);
    }

    @Override
    public void removeRealmRole(UUID keycloakId, String realmRole) {
        realmRoles.getOrDefault(keycloakId, ConcurrentHashMap.newKeySet()).remove(realmRole);
        log.info("[identity] removeRealmRole {} role={}", keycloakId, realmRole);
    }

    @Override
    public void updateUser(UUID keycloakId, String email, String firstName, String lastName, boolean enabled) {
        log.info("[identity] updateUser {} email={} enabled={}", keycloakId, email, enabled);
    }

    @Override
    public void setEnabled(UUID keycloakId, boolean enabled) {
        log.info("[identity] setEnabled {} enabled={}", keycloakId, enabled);
    }

    @Override
    public void resetPassword(UUID keycloakId, String password, boolean temporary) {
        log.info("[identity] resetPassword {} temporary={}", keycloakId, temporary);
    }

    @Override
    public void addRequiredAction(UUID keycloakId, String action) {
        log.info("[identity] addRequiredAction {} action={}", keycloakId, action);
    }

    /**
     * There is no provider, so there is no e-mail. This throws rather than
     * returning quietly: {@code SecurityAdminService.sendActions} reads a normal
     * return as "delivered" and puts that in {@code activationEmailSent}, so a
     * silent no-op made the API — and the admin UI reading it — claim an e-mail
     * had been sent when nothing had. The required action is still on the
     * account; only delivery is unavailable, which is exactly what
     * {@link ActivationDeliveryException} means.
     */
    @Override
    public void sendActionsEmail(UUID keycloakId, List<String> actions) {
        log.warn("[identity] sendActionsEmail {} actions={} — no identity provider is configured "
                + "(hub.identity.keycloak.enabled=false), so no e-mail was sent", keycloakId, actions);
        throw new ActivationDeliveryException(
                "no identity provider is configured (hub.identity.keycloak.enabled=false); "
                        + "the account action " + actions + " is set but no e-mail can be sent");
    }

    @Override
    public void clearBruteForce(UUID keycloakId) {
        log.info("[identity] clearBruteForce {}", keycloakId);
    }

    @Override
    public void logoutAllSessions(UUID keycloakId) {
        log.info("[identity] logoutAllSessions {} (sessions + refresh tokens revoked)", keycloakId);
    }

    @Override
    public void deleteUser(UUID keycloakId) {
        accountsByIdentifier.values().removeIf(keycloakId::equals);
        realmRoles.remove(keycloakId);
        log.info("[identity] deleteUser {} (compensating rollback)", keycloakId);
    }
}
