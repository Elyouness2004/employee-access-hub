package com.hub.hr.infrastructure;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.session.SessionDirectory;
import com.hub.hr.domain.session.UserSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Default session adapter: records the intended Keycloak operation and reports an
 * empty session list, so the module runs WITHOUT a Keycloak instance — mirroring
 * {@link LoggingIdentityProvisioner}. The real adapter
 * ({@link KeycloakAdminSessionDirectory}) takes over when
 * {@code hub.identity.keycloak.enabled=true}. Never throws.
 */
@Component
@ConditionalOnProperty(name = "hub.identity.keycloak.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingSessionDirectory implements SessionDirectory {

    private static final Logger log = LoggerFactory.getLogger(LoggingSessionDirectory.class);

    @Override
    public List<UserSession> sessionsOf(UUID keycloakId) {
        log.info("[sessions] sessionsOf {} (no Keycloak configured -> empty)", keycloakId);
        return List.of();
    }

    @Override
    public void terminate(String sessionId) {
        log.info("[sessions] terminate {} (session invalidated)", sessionId);
    }
}
