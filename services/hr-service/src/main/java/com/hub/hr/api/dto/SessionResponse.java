package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.List;

import com.hub.hr.domain.session.UserSession;
import com.hub.hr.infrastructure.SessionDetail;

/**
 * One active session (Part 8): the authoritative Keycloak facts (id, IP,
 * login/last-activity, clients, optional expiry) merged with the locally-held
 * attributes Keycloak's admin representation does not carry (browser, OS, device,
 * whether MFA was used). {@code current} marks the session the caller is using.
 */
public record SessionResponse(
        String id,
        boolean current,
        String browser,
        String operatingSystem,
        String deviceName,
        String ipAddress,
        Instant loginTime,
        Instant lastActivity,
        boolean mfaUsed,
        Instant expiresAt,
        List<String> clients) {

    public static SessionResponse from(UserSession session, SessionDetail detail, boolean current) {
        return new SessionResponse(
                session.id(),
                current,
                detail == null ? null : detail.getBrowser(),
                detail == null ? null : detail.getOperatingSystem(),
                detail == null ? null : detail.getDeviceName(),
                session.ipAddress(),
                session.start(),
                session.lastAccess(),
                detail != null && detail.isMfaUsed(),
                session.expiresAt(),
                session.clients());
    }
}
