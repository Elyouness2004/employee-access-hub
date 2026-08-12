package com.hub.hr.api;

import java.util.List;

import com.hub.hr.api.dto.LogoutOthersResponse;
import com.hub.hr.api.dto.SessionResponse;
import com.hub.hr.application.Actor;
import com.hub.hr.application.SessionQueryService;
import com.hub.hr.application.SessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Self-service session management (Part 8): the authenticated employee views and
 * terminates their <em>own</em> Keycloak SSO sessions. Coarse authentication is
 * enforced by the resource server ({@code /api/**}); fine-grained ownership is
 * enforced in the application layer (a caller only ever sees or ends their own
 * sessions — zero trust, defense-in-depth layer 3). Admin views of other
 * employees live on {@code /api/hr/admin} (HR/ADMIN), and admin force-logout
 * reuses the existing {@code revoke-sessions} / {@code disable} / {@code offboard}
 * operations rather than duplicating them.
 */
@RestController
@RequestMapping("/api/hr/sessions")
@Tag(name = "Session management")
public class SessionController {

    private final SessionQueryService queries;
    private final SessionService sessions;

    public SessionController(SessionQueryService queries, SessionService sessions) {
        this.queries = queries;
        this.sessions = sessions;
    }

    @GetMapping
    @Operation(summary = "List my active sessions (browser, OS, device, IP, login/last-activity, MFA, current)")
    public List<SessionResponse> mySessions(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                            @RequestHeader(value = "User-Agent", required = false) String userAgent) {
        Actor actor = Actors.from(jwt, auth);
        String currentSessionId = currentSessionId(jwt);
        sessions.enrichCurrent(actor, currentSessionId, userAgent, mfaUsed(jwt));
        return queries.mySessions(actor, currentSessionId);
    }

    @GetMapping("/current")
    @Operation(summary = "The session I am currently using")
    public SessionResponse current(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                   @RequestHeader(value = "User-Agent", required = false) String userAgent) {
        Actor actor = Actors.from(jwt, auth);
        String currentSessionId = currentSessionId(jwt);
        sessions.enrichCurrent(actor, currentSessionId, userAgent, mfaUsed(jwt));
        return queries.session(actor, currentSessionId, currentSessionId);
    }

    @GetMapping("/{sessionId}")
    @Operation(summary = "One of my sessions by id (404 if it is not mine)")
    public SessionResponse session(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                   @PathVariable String sessionId) {
        return queries.session(Actors.from(jwt, auth), sessionId, currentSessionId(jwt));
    }

    @DeleteMapping("/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Terminate one of my sessions (the current one needs confirmCurrent=true, else 409)")
    public void terminate(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                          @PathVariable String sessionId,
                          @RequestParam(defaultValue = "false") boolean confirmCurrent) {
        sessions.terminate(Actors.from(jwt, auth), sessionId, currentSessionId(jwt), confirmCurrent);
    }

    @PostMapping("/logout-others")
    @Operation(summary = "Terminate all my other sessions, keeping the current one")
    public LogoutOthersResponse logoutOthers(@AuthenticationPrincipal Jwt jwt, Authentication auth) {
        return new LogoutOthersResponse(
                sessions.terminateOthers(Actors.from(jwt, auth), currentSessionId(jwt)));
    }

    /** The current session id as carried by the access token's {@code sid} claim. */
    private static String currentSessionId(Jwt jwt) {
        return jwt.getClaimAsString("sid");
    }

    /**
     * Best-effort read of whether the session was established with MFA, from the
     * standard {@code acr} (step-up level) / {@code amr} (methods) claims. Keycloak
     * only emits these when configured; the raw value is what the platform has.
     */
    private static boolean mfaUsed(Jwt jwt) {
        String acr = jwt.getClaimAsString("acr");
        if (acr != null && !acr.equals("0") && !acr.equals("1")) {
            return true;
        }
        List<String> amr = jwt.getClaimAsStringList("amr");
        if (amr == null) {
            return false;
        }
        return amr.stream().map(String::toLowerCase).anyMatch(method ->
                method.contains("otp") || method.contains("totp") || method.contains("mfa")
                        || method.contains("sms") || method.equals("hwk"));
    }
}
