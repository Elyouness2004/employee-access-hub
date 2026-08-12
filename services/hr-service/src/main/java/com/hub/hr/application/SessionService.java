package com.hub.hr.application;

import java.util.List;

import com.hub.hr.domain.session.SessionDirectory;
import com.hub.hr.domain.session.UserSession;
import com.hub.hr.infrastructure.SessionDetail;
import com.hub.hr.infrastructure.SessionDetailRepository;
import com.hub.hr.infrastructure.UserAgentParser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Write side of session management (Part 8): a user acting on their <em>own</em>
 * sessions — capturing the device/MFA detail Keycloak's admin API does not carry,
 * terminating one session, or logging out every other session. Every logout writes
 * an audit entry with the request correlation id.
 *
 * <p>Admin force-logout / refresh-token revocation / offboarding disable are NOT
 * re-implemented here: they already exist on {@link SecurityAdminService} and
 * {@link OffboardingService} (which also write the security-event) and are reused.
 */
@Service
@Transactional
public class SessionService {

    private final SessionDirectory directory;
    private final SessionDetailRepository details;
    private final AuditTrail audit;

    public SessionService(SessionDirectory directory,
                          SessionDetailRepository details,
                          AuditTrail audit) {
        this.directory = directory;
        this.details = details;
        this.audit = audit;
    }

    /**
     * Upsert the local detail for the caller's current session from the request's
     * User-Agent and MFA claim. No-op when the access token carries no session id.
     */
    public void enrichCurrent(Actor actor, String currentSessionId, String userAgent, boolean mfaUsed) {
        if (currentSessionId == null || currentSessionId.isBlank()) {
            return;
        }
        UserAgentParser.Parsed device = UserAgentParser.parse(userAgent);
        details.findById(currentSessionId).ifPresentOrElse(
                detail -> {
                    detail.refresh(device.browser(), device.operatingSystem(), device.device(), userAgent, mfaUsed);
                    details.save(detail);
                },
                () -> details.save(new SessionDetail(currentSessionId, actor.keycloakId(),
                        device.browser(), device.operatingSystem(), device.device(), userAgent, mfaUsed)));
    }

    /** Terminate one of the caller's own sessions; the current one needs confirmation. */
    public void terminate(Actor actor, String sessionId, String currentSessionId, boolean confirmCurrent) {
        requireOwned(actor, sessionId);
        if (sessionId.equals(currentSessionId) && !confirmCurrent) {
            throw new CurrentSessionConfirmationRequiredException(sessionId);
        }
        directory.terminate(sessionId);
        details.findById(sessionId).ifPresent(details::delete);
        audit(actor, "LOGOUT_SESSION", "session:" + sessionId,
                sessionId.equals(currentSessionId) ? "current session terminated" : "session terminated");
    }

    /** Terminate every session the caller owns except the one they are using. */
    public int terminateOthers(Actor actor, String currentSessionId) {
        List<UserSession> sessions = directory.sessionsOf(actor.keycloakId());
        int terminated = 0;
        for (UserSession session : sessions) {
            if (!session.id().equals(currentSessionId)) {
                directory.terminate(session.id());
                details.findById(session.id()).ifPresent(details::delete);
                terminated++;
            }
        }
        audit(actor, "LOGOUT_OTHERS", "user:" + actor.keycloakId(),
                terminated + " other session(s) terminated, current session kept");
        return terminated;
    }

    private void requireOwned(Actor actor, String sessionId) {
        boolean owned = directory.sessionsOf(actor.keycloakId()).stream()
                .anyMatch(session -> session.id().equals(sessionId));
        if (!owned) {
            throw new ResourceNotFoundException("session", sessionId);
        }
    }

    private void audit(Actor actor, String action, String resource, String detail) {
        audit.record(actor.username(), action, resource,
                detail + " (correlationId=" + Correlation.currentOrNew() + ")");
    }
}
