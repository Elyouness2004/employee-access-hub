package com.hub.hr.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.hub.hr.api.dto.SessionResponse;
import com.hub.hr.domain.Employee;
import com.hub.hr.domain.session.SessionDirectory;
import com.hub.hr.domain.session.UserSession;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.SessionDetail;
import com.hub.hr.infrastructure.SessionDetailRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of session management (Part 8): lists the caller's own active
 * sessions and, for HR/Admin, any employee's — merging the authoritative Keycloak
 * session list ({@link SessionDirectory}) with the locally-held device/MFA detail.
 * Keycloak stays the source of truth for the session set; nothing it provides is
 * duplicated here.
 */
@Service
@Transactional(readOnly = true)
public class SessionQueryService {

    private final SessionDirectory directory;
    private final SessionDetailRepository details;
    private final EmployeeRepository employees;

    public SessionQueryService(SessionDirectory directory,
                               SessionDetailRepository details,
                               EmployeeRepository employees) {
        this.directory = directory;
        this.details = details;
        this.employees = employees;
    }

    /** The caller's own active sessions, with the one they are using flagged current. */
    public List<SessionResponse> mySessions(Actor actor, String currentSessionId) {
        return merge(directory.sessionsOf(actor.keycloakId()), currentSessionId);
    }

    /** A single session the caller owns; 404 if it is not one of theirs (zero trust). */
    public SessionResponse session(Actor actor, String sessionId, String currentSessionId) {
        UserSession match = directory.sessionsOf(actor.keycloakId()).stream()
                .filter(candidate -> candidate.id().equals(sessionId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("session", sessionId));
        SessionDetail detail = details.findById(sessionId).orElse(null);
        return SessionResponse.from(match, detail, sessionId.equals(currentSessionId));
    }

    /** HR/Admin view of one employee's active sessions; requires a provisioned account. */
    public List<SessionResponse> sessionsOf(UUID employeeId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
        if (!employee.isProvisioned()) {
            throw new EmployeeNotProvisionedException(employeeId);
        }
        return merge(directory.sessionsOf(employee.getKeycloakId()), null);
    }

    private List<SessionResponse> merge(List<UserSession> sessions, String currentSessionId) {
        if (sessions.isEmpty()) {
            return List.of();
        }
        Map<String, SessionDetail> byId = details
                .findAllBySessionIdIn(sessions.stream().map(UserSession::id).toList())
                .stream()
                .collect(Collectors.toMap(SessionDetail::getSessionId, Function.identity()));
        return sessions.stream()
                .map(session -> SessionResponse.from(session, byId.get(session.id()),
                        session.id().equals(currentSessionId)))
                .toList();
    }
}
