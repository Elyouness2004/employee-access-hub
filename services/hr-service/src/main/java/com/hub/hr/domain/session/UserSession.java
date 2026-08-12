package com.hub.hr.domain.session;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One active SSO session as Keycloak reports it (Admin REST
 * {@code GET /users/{id}/sessions}). These are the authoritative session facts —
 * id, source IP, login/last-activity instants, the optional expiry and the
 * clients the session has touched. Attributes Keycloak's admin representation
 * does not carry (browser, OS, device, whether MFA was used) are held locally in
 * {@code session_detail} and merged by the application layer, so this value
 * object stays a faithful mirror of the provider and never duplicates it.
 */
public record UserSession(
        String id,
        UUID userId,
        String ipAddress,
        Instant start,
        Instant lastAccess,
        Instant expiresAt,
        List<String> clients) {
}
