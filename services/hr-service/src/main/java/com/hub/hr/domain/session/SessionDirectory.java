package com.hub.hr.domain.session;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.identity.IdentityUnavailableException;

/**
 * Port to the identity provider's session surface (Keycloak Admin REST). Kept in
 * the domain so the application services depend on the abstraction, not on
 * Keycloak — the same split as {@link com.hub.hr.domain.identity.IdentityProvisioner}:
 * a config-gated real adapter (needs a running Keycloak), a logging default so the
 * service runs without one, and a recording fake for tests.
 *
 * <p>Killing <em>all</em> sessions (force logout + refresh-token revocation) is
 * deliberately absent here: it already exists as
 * {@link com.hub.hr.domain.identity.IdentityProvisioner#logoutAllSessions(UUID)}
 * and is reused rather than duplicated.
 *
 * <p>Every method may throw {@link IdentityUnavailableException} when the provider
 * cannot be reached.
 */
public interface SessionDirectory {

    /** The active SSO sessions of one account (empty when there are none). */
    List<UserSession> sessionsOf(UUID keycloakId);

    /** Terminate a single SSO session by its Keycloak session id. */
    void terminate(String sessionId);
}
