package com.hub.hr.application;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.event.DomainEventPublisher;
import com.hub.hr.domain.event.EmployeeUpdated;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.ProvisioningRecord;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.ProvisioningRecordStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Identity synchronization (Part 2): when a provisioned employee's email, name,
 * status or reporting line changes, push it to the Keycloak account — profile and
 * enabled flag in step with the status (ACTIVE→enabled, DISABLED/TERMINATED→
 * disabled), and the derived realm role in step with the org chart. Best-effort
 * toward eventual consistency: a provider failure is recorded (history + audit),
 * never rolled back into the HR write, and the {@code EmployeeUpdated} event is
 * emitted regardless so downstream can re-converge.
 *
 * <p>The role half matters as much as the profile half. {@code MANAGER} is
 * derived from having at least one direct report, so it changes when <em>somebody
 * else's</em> record is edited — the moment a team is moved, the old manager's
 * account is carrying a privilege the org chart no longer justifies. Syncing the
 * role here is what closes that window; {@link EmployeeService} is responsible
 * for asking on behalf of both the old and the new manager.
 */
@Service
public class IdentitySyncService {

    private final EmployeeRepository employees;
    private final IdentityProvisioner identity;
    private final RealmRoleResolver roleResolver;
    private final RealmRoleSynchronizer roleSynchronizer;
    private final ProvisioningRecordRepository records;
    private final DomainEventPublisher events;
    private final AuditTrail audit;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public IdentitySyncService(EmployeeRepository employees,
                               IdentityProvisioner identity,
                               RealmRoleResolver roleResolver,
                               RealmRoleSynchronizer roleSynchronizer,
                               ProvisioningRecordRepository records,
                               DomainEventPublisher events,
                               AuditTrail audit) {
        this.employees = employees;
        this.identity = identity;
        this.roleResolver = roleResolver;
        this.roleSynchronizer = roleSynchronizer;
        this.records = records;
        this.events = events;
        this.audit = audit;
    }

    @Transactional
    public void sync(Actor actor, UUID employeeId) {
        Employee employee = employees.findById(employeeId).orElse(null);
        if (employee == null || !employee.isProvisioned()) {
            return; // nothing to synchronize until onboarding has linked an account
        }
        UUID keycloakId = employee.getKeycloakId();
        boolean enabled = employee.getStatus().keycloakEnabled();
        String correlationId = Correlation.currentOrNew();
        try {
            identity.updateUser(keycloakId, employee.getEmail(), employee.getFirstName(),
                    employee.getLastName(), enabled);
            String role = roleResolver.resolve(employee);
            RealmRoleSynchronizer.RoleSyncResult sync = roleSynchronizer.synchronize(keycloakId, role);
            employee.setLastSyncAt(Instant.now());
            employee.setProvisioningStatus(enabled
                    ? ProvisioningStatus.PROVISIONED : ProvisioningStatus.DISABLED);
            employees.save(employee);
            String detail = "status=" + employee.getStatus() + " enabled=" + enabled + " " + sync.describe();
            records.save(new ProvisioningRecord(employeeId, keycloakId, "SYNC",
                    ProvisioningRecordStatus.SYNCED, detail));
            audit.record(actor.username(), "EMPLOYEE_SYNCED", "employee:" + employeeId, detail);
        } catch (RuntimeException e) {
            records.save(new ProvisioningRecord(employeeId, keycloakId, "SYNC",
                    ProvisioningRecordStatus.FAILED, summarize(e)));
            audit.record(actor.username(), "EMPLOYEE_SYNC_FAILED", "employee:" + employeeId, summarize(e));
        }
        events.publish(EmployeeUpdated.of(employeeId, keycloakId, employee.getEmail(),
                employee.getStatus().name(), enabled, correlationId));
    }

    private static String summarize(Throwable e) {
        String message = e.getMessage();
        return e.getClass().getSimpleName() + (message != null ? ": " + message : "");
    }
}
