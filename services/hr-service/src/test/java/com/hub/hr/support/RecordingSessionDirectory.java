package com.hub.hr.support;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.hub.hr.domain.session.SessionDirectory;
import com.hub.hr.domain.session.UserSession;

/**
 * Test double for the session provider: seeds active sessions per account and
 * records every termination, so tests can assert the exact Keycloak interactions
 * without a real Keycloak — mirroring {@link RecordingIdentityProvisioner}.
 */
public class RecordingSessionDirectory implements SessionDirectory {

    public final List<UserSession> sessions = new CopyOnWriteArrayList<>();
    public final List<String> terminated = new CopyOnWriteArrayList<>();

    public void reset() {
        sessions.clear();
        terminated.clear();
    }

    /** Seed one active session owned by {@code userId}; returns its id. */
    public String seed(String id, UUID userId) {
        sessions.add(new UserSession(id, userId, "203.0.113.7",
                Instant.now().minusSeconds(3600), Instant.now(), null, List.of("hub-web")));
        return id;
    }

    @Override
    public List<UserSession> sessionsOf(UUID keycloakId) {
        return sessions.stream().filter(session -> keycloakId.equals(session.userId())).toList();
    }

    @Override
    public void terminate(String sessionId) {
        terminated.add(sessionId);
        sessions.removeIf(session -> session.id().equals(sessionId));
    }
}
