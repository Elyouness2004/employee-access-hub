package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.event.DomainEventPublisher;
import com.hub.hr.domain.event.EmployeeDeactivated;
import com.hub.hr.domain.event.EmployeeReactivated;
import com.hub.hr.domain.identity.ActivationDeliveryException;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.notification.NotificationType;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.ProvisioningRecord;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.ProvisioningRecordStatus;
import com.hub.hr.infrastructure.SecurityEvent;
import com.hub.hr.infrastructure.SecurityEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Security-hardening admin operations (Parts 6 & 7): password reset, deactivate,
 * reactivate, account lock/unlock, MFA enrolment, role synchronization and
 * refresh-token/session revocation. Every action writes a provisioning-history
 * row, a security-event row and an audit entry in the same transaction. All
 * target a provisioned account.
 *
 * <p>Each operation stays distinct on purpose — they are not variations of
 * "disable the account":
 *
 * <ul>
 *   <li><b>lock</b> is a security hold. The account is disabled and its sessions
 *       killed; employment status is untouched, and unlock reverses it.</li>
 *   <li><b>deactivate</b> is an employment change. Status becomes DISABLED and
 *       the account follows. Reversible through {@link #reactivate}.</li>
 *   <li><b>revoke sessions</b> touches neither: the account stays enabled and the
 *       person can sign straight back in.</li>
 * </ul>
 *
 * Collapsing them would lose the distinction the audit trail exists to record.
 */
@Service
@Transactional
public class SecurityAdminService {

    private static final Logger log = LoggerFactory.getLogger(SecurityAdminService.class);

    /** Keycloak required action for authenticator-app (TOTP) enrolment. */
    public static final String CONFIGURE_TOTP = "CONFIGURE_TOTP";

    private final EmployeeRepository employees;
    private final IdentityProvisioner identity;
    private final PasswordGenerator passwords;
    private final RealmRoleResolver roleResolver;
    private final RealmRoleSynchronizer roleSynchronizer;
    private final ProvisioningRecordRepository records;
    private final SecurityEventRepository securityEvents;
    private final DomainEventPublisher events;
    private final AuditTrail audit;
    private final NotificationService notifications;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public SecurityAdminService(EmployeeRepository employees,
                                IdentityProvisioner identity,
                                PasswordGenerator passwords,
                                RealmRoleResolver roleResolver,
                                RealmRoleSynchronizer roleSynchronizer,
                                ProvisioningRecordRepository records,
                                SecurityEventRepository securityEvents,
                                DomainEventPublisher events,
                                AuditTrail audit,
                                NotificationService notifications) {
        this.employees = employees;
        this.identity = identity;
        this.passwords = passwords;
        this.roleResolver = roleResolver;
        this.roleSynchronizer = roleSynchronizer;
        this.records = records;
        this.securityEvents = securityEvents;
        this.events = events;
        this.audit = audit;
        this.notifications = notifications;
    }

    /**
     * Reset the password the Keycloak way: invalidate the current credential,
     * force a change at next sign-in, and have Keycloak e-mail the employee an
     * action token for its own password form.
     *
     * <p>The credential is overwritten with a value generated here and
     * immediately discarded — never returned, logged, audited or stored. Its only
     * job is to stop the old password working the moment the reset is ordered;
     * the required action alone would leave the old password able to authenticate.
     * The employee's real new password is chosen by them, in Keycloak, and this
     * service never sees it.
     *
     * @return whether the password-setup e-mail was actually delivered
     */
    public boolean resetPassword(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        identity.resetPassword(employee.getKeycloakId(), passwords.generateTemporary(), true);
        identity.addRequiredAction(employee.getKeycloakId(), ProvisioningService.UPDATE_PASSWORD);
        boolean sent = sendActions(employee.getKeycloakId(), List.of(ProvisioningService.UPDATE_PASSWORD));
        journal(employee, "RESET_PASSWORD", ProvisioningRecordStatus.PASSWORD_RESET,
                "PASSWORD_RESET", actor,
                "current credential invalidated, password setup required, e-mail "
                        + (sent ? "sent" : "not sent"));
        return sent;
    }

    /**
     * Require MFA enrolment: Keycloak's own {@code CONFIGURE_TOTP} required action,
     * so the employee enrols an authenticator app at next sign-in. No TOTP secret,
     * verification or recovery code is handled here — all of it belongs to
     * Keycloak, which is why this is a two-line operation and not a subsystem.
     *
     * @return whether the enrolment e-mail was delivered (enrolment is required
     *         either way — the action is on the account)
     */
    public boolean requireMfaEnrolment(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        identity.addRequiredAction(employee.getKeycloakId(), CONFIGURE_TOTP);
        boolean sent = sendActions(employee.getKeycloakId(), List.of(CONFIGURE_TOTP));
        journal(employee, "REQUIRE_MFA", ProvisioningRecordStatus.MFA_REQUIRED,
                "MFA_ENABLED", actor,
                "authenticator-app enrolment required at next sign-in, e-mail " + (sent ? "sent" : "not sent"));
        return sent;
    }

    /** Deactivate: status DISABLED, account disabled, sessions revoked. Reversible. */
    public void disable(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        employee.setStatus(EmployeeStatus.DISABLED);
        employee.setProvisioningStatus(ProvisioningStatus.DISABLED);
        identity.setEnabled(employee.getKeycloakId(), false);
        identity.logoutAllSessions(employee.getKeycloakId());
        employees.save(employee);
        journal(employee, "DISABLE", ProvisioningRecordStatus.DISABLED,
                "DISABLED", actor, "account deactivated, sessions revoked");
        events.publish(EmployeeDeactivated.of(employeeId, employee.getKeycloakId(), employee.getEmail(),
                "deactivated by " + actor.username(), Correlation.currentOrNew()));
    }

    /**
     * Reactivate a deactivated employee: status ACTIVE, account re-enabled, derived
     * role re-synchronized. Refuses a TERMINATED record — offboarding is terminal,
     * and re-enabling an offboarded account through a "reactivate" button is
     * exactly the accident this guard exists to prevent.
     */
    public String reactivate(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        if (employee.getStatus() == EmployeeStatus.TERMINATED) {
            throw new IllegalEmployeeStateException(
                    "employee " + employeeId + " is TERMINATED; offboarding is terminal and cannot be reactivated");
        }
        employee.setStatus(EmployeeStatus.ACTIVE);
        employee.setProvisioningStatus(ProvisioningStatus.PROVISIONED);
        identity.setEnabled(employee.getKeycloakId(), true);
        identity.clearBruteForce(employee.getKeycloakId());
        String role = roleResolver.resolve(employee);
        RealmRoleSynchronizer.RoleSyncResult sync = roleSynchronizer.synchronize(employee.getKeycloakId(), role);
        employees.save(employee);
        journal(employee, "REACTIVATE", ProvisioningRecordStatus.REACTIVATED,
                "REACTIVATED", actor, "account re-enabled, " + sync.describe());
        events.publish(EmployeeReactivated.of(employeeId, employee.getKeycloakId(), employee.getEmail(),
                role, Correlation.currentOrNew()));
        return role;
    }

    /** Temporary lock: account disabled, provisioning state LOCKED, status unchanged. */
    public void lock(Actor actor, UUID employeeId, String reason) {
        Employee employee = requireProvisioned(employeeId);
        employee.setProvisioningStatus(ProvisioningStatus.LOCKED);
        identity.setEnabled(employee.getKeycloakId(), false);
        identity.logoutAllSessions(employee.getKeycloakId());
        employees.save(employee);
        journal(employee, "LOCK", ProvisioningRecordStatus.LOCKED,
                "LOCK", actor, reason != null ? reason : "account locked by admin");
    }

    /**
     * Admin unlock: clear the lock and let the employee sign in again — but only
     * while employment says they may. A DISABLED or TERMINATED record keeps its
     * disabled account: unlocking is not a back door around the employment
     * lifecycle. The brute-force counter is cleared either way, because an admin
     * lock and a failed-login lockout are two different locks and clearing one
     * while leaving the other would look like the unlock silently did nothing.
     */
    public void unlock(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        identity.clearBruteForce(employee.getKeycloakId());
        boolean reEnabled = employee.getStatus() == EmployeeStatus.ACTIVE;
        if (reEnabled) {
            employee.setProvisioningStatus(ProvisioningStatus.PROVISIONED);
            identity.setEnabled(employee.getKeycloakId(), true);
        }
        employees.save(employee);
        journal(employee, "UNLOCK", ProvisioningRecordStatus.UNLOCKED,
                "UNLOCK", actor, reEnabled
                        ? "account unlocked and re-enabled"
                        : "lockout cleared; account stays disabled while employment is "
                                + employee.getStatus());
    }

    /** Recompute the derived realm role and push it to the account as a replacement. */
    public String forceRoleSync(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        String role = roleResolver.resolve(employee);
        RealmRoleSynchronizer.RoleSyncResult sync = roleSynchronizer.synchronize(employee.getKeycloakId(), role);
        journal(employee, "ROLE_SYNC", ProvisioningRecordStatus.ROLES_SYNCED,
                "ROLE_CHANGED", actor, sync.describe());
        return role;
    }

    /** Refresh-token revocation + session invalidation (token replay hardening). */
    public void revokeSessions(Actor actor, UUID employeeId) {
        Employee employee = requireProvisioned(employeeId);
        identity.logoutAllSessions(employee.getKeycloakId());
        journal(employee, "REVOKE_SESSIONS", ProvisioningRecordStatus.SESSIONS_REVOKED,
                "REVOKE", actor, "sessions + refresh tokens revoked");
    }

    /** Best-effort account e-mail: an undelivered message never fails the action. */
    private boolean sendActions(UUID keycloakId, List<String> actions) {
        try {
            identity.sendActionsEmail(keycloakId, actions);
            return true;
        } catch (ActivationDeliveryException e) {
            log.warn("account action {} is set on {} but the e-mail could not be delivered",
                    actions, keycloakId, e);
            return false;
        } catch (RuntimeException e) {
            log.warn("account action e-mail {} failed for {}", actions, keycloakId, e);
            return false;
        }
    }

    private Employee requireProvisioned(UUID employeeId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
        if (!employee.isProvisioned()) {
            throw new EmployeeNotProvisionedException(employeeId);
        }
        return employee;
    }

    private void journal(Employee employee, String action, ProvisioningRecordStatus status,
                         String securityType, Actor actor, String detail) {
        records.save(new ProvisioningRecord(employee.getId(), employee.getKeycloakId(), action, status, detail));
        securityEvents.save(new SecurityEvent(employee.getKeycloakId(), employee.getEmail(),
                securityType, actor.username(), detail));
        audit.record(actor.username(), "SECURITY_" + action, "employee:" + employee.getId(), detail);
        notifications.create(employee.getKeycloakId(), employee.getId(), notificationType(securityType), null);
    }

    /** Map the security-event type this service already records to a notification type. */
    private static NotificationType notificationType(String securityType) {
        return switch (securityType) {
            case "PASSWORD_RESET" -> NotificationType.PASSWORD_RESET;
            case "LOCK" -> NotificationType.ACCOUNT_LOCKED;
            case "UNLOCK" -> NotificationType.ACCOUNT_UNLOCKED;
            case "DISABLED" -> NotificationType.ACCOUNT_DISABLED;
            case "REACTIVATED" -> NotificationType.ACCOUNT_REACTIVATED;
            case "MFA_ENABLED" -> NotificationType.MFA_ENROLMENT_REQUIRED;
            case "REVOKE" -> NotificationType.SESSION_REVOKED;
            default -> NotificationType.ADMIN_ACTION; // ROLE_CHANGED and any future security action
        };
    }
}
