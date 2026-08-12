package com.hub.hr.api;

import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.OffboardingResponse;
import com.hub.hr.api.dto.ProvisioningHistoryResponse;
import com.hub.hr.api.dto.ProvisioningStatusResponse;
import com.hub.hr.api.dto.SecurityEventResponse;
import com.hub.hr.api.dto.SessionResponse;
import com.hub.hr.api.dto.LockRequest;
import com.hub.hr.application.Actor;
import com.hub.hr.application.IdentityQueryService;
import com.hub.hr.application.OffboardingService;
import com.hub.hr.application.ProvisioningOutcome;
import com.hub.hr.application.ProvisioningService;
import com.hub.hr.application.SecurityAdminService;
import com.hub.hr.application.SessionQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR/Admin identity administration (Part 7). Coarse RBAC at layer 2 (HR/ADMIN);
 * routed through the gateway like the rest of {@code /api/hr/**}. Manual
 * provisioning, retry of failed provisioning, offboarding, and the Part-6
 * security operations (reset, disable, lock/unlock, role sync, session
 * revocation), plus provisioning and security-event history.
 */
@RestController
@RequestMapping("/api/hr/admin")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Identity administration")
public class AdminProvisioningController {

    private final ProvisioningService provisioning;
    private final OffboardingService offboarding;
    private final SecurityAdminService security;
    private final IdentityQueryService queries;
    private final SessionQueryService sessionQueries;

    public AdminProvisioningController(ProvisioningService provisioning,
                                       OffboardingService offboarding,
                                       SecurityAdminService security,
                                       IdentityQueryService queries,
                                       SessionQueryService sessionQueries) {
        this.provisioning = provisioning;
        this.offboarding = offboarding;
        this.security = security;
        this.queries = queries;
        this.sessionQueries = sessionQueries;
    }

    @GetMapping("/employees/{id}/identity")
    @Operation(summary = "Current identity state: employment status, account state, derived realm role")
    public ProvisioningStatusResponse identity(@PathVariable UUID id) {
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/provision")
    @Operation(summary = "Provision the employee into Keycloak (idempotent; adopts an existing "
            + "account for the same username; 502 on provider failure)")
    public ProvisioningStatusResponse provision(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                @PathVariable UUID id) {
        ProvisioningOutcome outcome = provisioning.provision(actor(jwt, auth), id);
        return queries.provisioningStatus(id, activationOutcome(outcome));
    }

    @PostMapping("/employees/{id}/reprovision")
    @Operation(summary = "Retry provisioning for a failed account")
    public ProvisioningStatusResponse reprovision(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                  @PathVariable UUID id) {
        ProvisioningOutcome outcome = provisioning.provision(actor(jwt, auth), id);
        return queries.provisioningStatus(id, activationOutcome(outcome));
    }

    /** Only report delivery for an attempt that actually sent something. */
    private static Boolean activationOutcome(ProvisioningOutcome outcome) {
        return outcome.alreadyProvisioned() ? null : outcome.activationEmailSent();
    }

    @PostMapping("/employees/{id}/offboard")
    @Operation(summary = "Offboard: disable account, revoke sessions, fan out BR-05, emit event")
    public OffboardingResponse offboard(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                        @PathVariable UUID id) {
        return OffboardingResponse.from(offboarding.offboard(actor(jwt, auth), id));
    }

    @PostMapping("/employees/{id}/reset-password")
    @Operation(summary = "Invalidate the current credential and have Keycloak e-mail the employee a "
            + "password-setup action token. No password is generated for or returned by this API.")
    public ProvisioningStatusResponse resetPassword(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                    @PathVariable UUID id) {
        boolean sent = security.resetPassword(actor(jwt, auth), id);
        return queries.provisioningStatus(id, sent);
    }

    @PostMapping("/employees/{id}/require-mfa")
    @Operation(summary = "Require authenticator-app (TOTP) enrolment at next sign-in via Keycloak's "
            + "CONFIGURE_TOTP required action")
    public ProvisioningStatusResponse requireMfa(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                 @PathVariable UUID id) {
        boolean sent = security.requireMfaEnrolment(actor(jwt, auth), id);
        return queries.provisioningStatus(id, sent);
    }

    @PostMapping("/employees/{id}/disable")
    @Operation(summary = "Deactivate: employment DISABLED, account disabled, sessions revoked (reversible)")
    public ProvisioningStatusResponse disable(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                              @PathVariable UUID id) {
        security.disable(actor(jwt, auth), id);
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/reactivate")
    @Operation(summary = "Reverse a deactivation: employment ACTIVE, account re-enabled, role "
            + "re-synchronized. 409 for a TERMINATED record — offboarding is terminal.")
    public ProvisioningStatusResponse reactivate(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                 @PathVariable UUID id) {
        security.reactivate(actor(jwt, auth), id);
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/lock")
    @Operation(summary = "Lock the account (disable + revoke sessions), status unchanged")
    public ProvisioningStatusResponse lock(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                           @PathVariable UUID id, @RequestBody(required = false) LockRequest body) {
        security.lock(actor(jwt, auth), id, body == null ? null : body.reason());
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/unlock")
    @Operation(summary = "Unlock the account (re-enable if the employee is ACTIVE)")
    public ProvisioningStatusResponse unlock(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                             @PathVariable UUID id) {
        security.unlock(actor(jwt, auth), id);
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/sync-roles")
    @Operation(summary = "Force role synchronization (recompute derived realm role)")
    public ProvisioningStatusResponse syncRoles(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                @PathVariable UUID id) {
        security.forceRoleSync(actor(jwt, auth), id);
        return queries.provisioningStatus(id);
    }

    @PostMapping("/employees/{id}/revoke-sessions")
    @Operation(summary = "Revoke SSO sessions + refresh tokens (token-replay hardening)")
    public ProvisioningStatusResponse revokeSessions(@AuthenticationPrincipal Jwt jwt, Authentication auth,
                                                     @PathVariable UUID id) {
        security.revokeSessions(actor(jwt, auth), id);
        return queries.provisioningStatus(id);
    }

    @GetMapping("/employees/{id}/provisioning")
    @Operation(summary = "Provisioning history for one employee")
    public List<ProvisioningHistoryResponse> history(@PathVariable UUID id) {
        return queries.historyFor(id);
    }

    @GetMapping("/employees/{id}/security-events")
    @Operation(summary = "Security-event history for one employee")
    public List<SecurityEventResponse> securityEvents(@PathVariable UUID id) {
        return queries.securityEventsFor(id);
    }

    @GetMapping("/employees/{id}/sessions")
    @Operation(summary = "Active SSO sessions of one employee (force logout via revoke-sessions/disable/offboard)")
    public List<SessionResponse> sessions(@PathVariable UUID id) {
        return sessionQueries.sessionsOf(id);
    }

    @GetMapping("/provisioning")
    @Operation(summary = "Recent provisioning history across all employees")
    public List<ProvisioningHistoryResponse> recentHistory() {
        return queries.recentHistory();
    }

    private static Actor actor(Jwt jwt, Authentication authentication) {
        return Actors.from(jwt, authentication);
    }
}
