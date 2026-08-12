package com.hub.hr.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.identity.ActivationDeliveryException;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.identity.IdentityUnavailableException;
import com.hub.hr.domain.identity.NewIdentity;
import com.hub.hr.infrastructure.EmployeeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Employee identity onboarding (P3.2). Deliberately NOT {@code @Transactional} at
 * the class level: the identity provider is called outside any DB transaction so
 * a slow/failed Keycloak call never holds a row lock, and the outcome is then
 * committed by {@link ProvisioningJournal}. On failure the half-created account is
 * compensated (deleted) and a FAILED history row is committed independently, so
 * the system is never left in an inconsistent state.
 *
 * <p><b>The employee → Keycloak link is created here and only here.</b> There is
 * no {@code keycloakId} on {@code EmployeeRequest}: CRUD describes the person,
 * this service owns the account relationship. Three things make that safe to run
 * repeatedly:
 *
 * <ol>
 *   <li><b>Idempotent.</b> An already-linked, healthy account is a no-op.</li>
 *   <li><b>Adopts instead of duplicating.</b> If Keycloak already has an account
 *       for this username — a pre-seeded user, a retry after the link was lost
 *       mid-failure — it is linked rather than created a second time. Keycloak
 *       forbids duplicate usernames anyway; without this the retry would fail
 *       forever with a 409 the operator cannot clear from the HR side.</li>
 *   <li><b>Never creates a broken link.</b> An account already claimed by a
 *       different employee row is refused outright, so one Keycloak subject can
 *       never resolve to two employees (which would break every ownership check
 *       that compares {@code sub} to {@code keycloakId}).</li>
 * </ol>
 *
 * <p>No password is generated. The account is created without a credential and
 * with Keycloak's {@code UPDATE_PASSWORD} required action; Keycloak e-mails the
 * employee an action token and they set their own password. A failed e-mail is
 * reported, not fatal — the account and its required action are already correct.
 */
@Service
public class ProvisioningService {

    private static final Logger log = LoggerFactory.getLogger(ProvisioningService.class);

    /** Keycloak required action forcing password setup at first sign-in. */
    public static final String UPDATE_PASSWORD = "UPDATE_PASSWORD";

    private final EmployeeRepository employees;
    private final IdentityProvisioner identity;
    private final RealmRoleResolver roleResolver;
    private final RealmRoleSynchronizer roleSynchronizer;
    private final ProvisioningJournal journal;
    private final boolean activationEnabled;

    public ProvisioningService(EmployeeRepository employees,
                               IdentityProvisioner identity,
                               RealmRoleResolver roleResolver,
                               RealmRoleSynchronizer roleSynchronizer,
                               ProvisioningJournal journal,
                               @org.springframework.beans.factory.annotation.Value(
                                       "${hub.identity.activation.enabled:true}") boolean activationEnabled) {
        this.employees = employees;
        this.identity = identity;
        this.roleResolver = roleResolver;
        this.roleSynchronizer = roleSynchronizer;
        this.journal = journal;
        this.activationEnabled = activationEnabled;
    }

    /**
     * Provision (or re-provision) the employee's Keycloak account. Idempotent: an
     * already-linked, healthy account is a no-op; a FAILED (unlinked) record is
     * retried; an account that already exists in Keycloak is adopted. Requires
     * the employee to be ACTIVE.
     */
    public ProvisioningOutcome provision(Actor actor, UUID employeeId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));

        if (employee.isProvisioned() && employee.getProvisioningStatus() == ProvisioningStatus.PROVISIONED) {
            return ProvisioningOutcome.alreadyProvisioned(employeeId, employee.getKeycloakId(),
                    roleResolver.resolve(employee));
        }
        if (employee.getStatus() != EmployeeStatus.ACTIVE) {
            throw new ProvisioningException("employee " + employeeId + " must be ACTIVE to be provisioned"
                    + " (status=" + employee.getStatus() + ")");
        }

        String role = roleResolver.resolve(employee);
        String username = employee.getEmail();

        UUID keycloakId = null;
        boolean created = false;
        try {
            Optional<UUID> existing = identity.findAccount(username);
            if (existing.isPresent()) {
                keycloakId = existing.get();
                requireUnclaimed(employeeId, keycloakId, username);
                // Adopting: bring the account back in line with the HR record
                // rather than trusting whatever state it was left in.
                identity.updateUser(keycloakId, employee.getEmail(), employee.getFirstName(),
                        employee.getLastName(), true);
            } else {
                keycloakId = identity.createUser(NewIdentity.withoutCredential(
                        username, employee.getEmail(), employee.getFirstName(), employee.getLastName(), role));
                created = true;
                requireUnclaimed(employeeId, keycloakId, username);
            }
            roleSynchronizer.synchronize(keycloakId, role);
            if (created) {
                // Only a BRAND-NEW account gets the forced password setup. An
                // adopted account already has a credential its owner knows, and
                // Keycloak refuses to authenticate an account with a pending
                // required action — so forcing one here would lock a working user
                // out of a linking operation that should not touch credentials at
                // all. Forcing a change on an existing account is what
                // reset-password is for, and it is a deliberate decision.
                identity.addRequiredAction(keycloakId, UPDATE_PASSWORD);
            }
        } catch (ProvisioningException e) {
            // A claimed account is a data problem, not a provider problem: nothing
            // was created for us to compensate, and deleting somebody else's
            // account would be catastrophic.
            journal.recordFailure(employeeId, "ONBOARD", actor, summarize(e));
            throw e;
        } catch (IdentityUnavailableException e) {
            // Keycloak was not reached at all. Surfaced as 503, never flattened
            // into the 502 above: "review the record and retry" and "the provider
            // is down, wait" send an operator to two different places, and only
            // one of them has anything to fix.
            if (keycloakId != null && created) {
                compensate(keycloakId);
            }
            journal.recordFailure(employeeId, "ONBOARD", actor, summarize(e));
            throw e;
        } catch (RuntimeException e) {
            if (keycloakId != null && created) {
                compensate(keycloakId);
            }
            journal.recordFailure(employeeId, "ONBOARD", actor, summarize(e));
            throw new ProvisioningException("provisioning failed for employee " + employeeId, e);
        }

        // Likewise the activation e-mail: it invites somebody to set a password
        // they already have, and it is the counterpart of the required action
        // above. Adoption is silent by design.
        boolean activationSent = created && sendActivation(keycloakId);
        journal.recordProvisioned(employeeId, keycloakId, role, actor, Correlation.currentOrNew(),
                created, activationSent);
        return new ProvisioningOutcome(employeeId, keycloakId, role, false, created, activationSent);
    }

    /**
     * Ask Keycloak to e-mail the password-setup action token. Returns whether it
     * was delivered; never throws, because an undelivered e-mail must not undo a
     * correctly provisioned account.
     */
    private boolean sendActivation(UUID keycloakId) {
        if (!activationEnabled) {
            return false;
        }
        try {
            identity.sendActionsEmail(keycloakId, List.of(UPDATE_PASSWORD));
            return true;
        } catch (ActivationDeliveryException e) {
            log.warn("account {} was provisioned but the activation e-mail could not be delivered"
                    + " — the UPDATE_PASSWORD action is set and the employee can use password recovery", keycloakId, e);
            return false;
        } catch (RuntimeException e) {
            log.warn("account {} was provisioned but the activation e-mail failed", keycloakId, e);
            return false;
        }
    }

    /** Refuse to link an account another employee record already owns. */
    private void requireUnclaimed(UUID employeeId, UUID keycloakId, String username) {
        employees.findByKeycloakId(keycloakId)
                .filter(other -> !other.getId().equals(employeeId))
                .ifPresent(other -> {
                    throw new ProvisioningException("Keycloak account " + username
                            + " is already linked to employee " + other.getId()
                            + "; resolve the duplicate before provisioning " + employeeId);
                });
    }

    /** Best-effort rollback of a half-created account (assign-role failed, etc.). */
    private void compensate(UUID keycloakId) {
        try {
            identity.deleteUser(keycloakId);
        } catch (RuntimeException ignored) {
            // best effort: the FAILED record still captures the inconsistency to reconcile
        }
    }

    private static String summarize(Throwable e) {
        String message = e.getMessage();
        return e.getClass().getSimpleName() + (message != null ? ": " + message : "");
    }
}
