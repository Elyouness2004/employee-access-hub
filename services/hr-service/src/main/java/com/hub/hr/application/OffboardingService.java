package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.event.DomainEventPublisher;
import com.hub.hr.domain.event.EmployeeOffboarded;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.notification.NotificationType;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.ProvisioningRecord;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.ProvisioningRecordStatus;
import com.hub.hr.infrastructure.SecurityEvent;
import com.hub.hr.infrastructure.SecurityEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employee offboarding (P3.3). Marks the record TERMINATED, disables the Keycloak
 * account and kills its sessions + refresh tokens (residual access bounded to the
 * access-token lifetime — the secure-offboarding argument), then fans out the
 * BR-05 signal to leave/expense/documents and emits {@code EmployeeOffboarded}.
 * Downstream notification is best-effort: an outage there is recorded, not fatal.
 */
@Service
@Transactional
public class OffboardingService {

    private final EmployeeRepository employees;
    private final IdentityProvisioner identity;
    private final OffboardingNotifier notifier;
    private final DomainEventPublisher events;
    private final ProvisioningRecordRepository records;
    private final SecurityEventRepository securityEvents;
    private final AuditTrail audit;
    private final NotificationService notifications;

    public OffboardingService(EmployeeRepository employees,
                              IdentityProvisioner identity,
                              OffboardingNotifier notifier,
                              DomainEventPublisher events,
                              ProvisioningRecordRepository records,
                              SecurityEventRepository securityEvents,
                              AuditTrail audit,
                              NotificationService notifications) {
        this.employees = employees;
        this.identity = identity;
        this.notifier = notifier;
        this.events = events;
        this.records = records;
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.notifications = notifications;
    }

    public OffboardingOutcome offboard(Actor actor, UUID employeeId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
        UUID keycloakId = employee.getKeycloakId();
        String correlationId = Correlation.currentOrNew();

        employee.setStatus(EmployeeStatus.TERMINATED);
        employee.setProvisioningStatus(ProvisioningStatus.DISABLED);

        boolean identityDisabled = false;
        if (keycloakId != null) {
            try {
                identity.setEnabled(keycloakId, false);
                identity.logoutAllSessions(keycloakId);
                identityDisabled = true;
                records.save(new ProvisioningRecord(employeeId, keycloakId, "OFFBOARD",
                        ProvisioningRecordStatus.DISABLED, "account disabled + sessions revoked"));
                securityEvents.save(new SecurityEvent(keycloakId, employee.getEmail(), "OFFBOARDED",
                        actor.username(), "account disabled, sessions + refresh tokens revoked"));
            } catch (RuntimeException e) {
                records.save(new ProvisioningRecord(employeeId, keycloakId, "OFFBOARD",
                        ProvisioningRecordStatus.FAILED, summarize(e)));
            }
        }
        employees.save(employee);

        OffboardingNotifier.OffboardingFanout fanout = keycloakId != null
                ? notifier.notifyDownstream(keycloakId)
                : new OffboardingNotifier.OffboardingFanout(List.of(), List.of());

        events.publish(EmployeeOffboarded.of(employeeId, keycloakId, employee.getEmail(), correlationId));
        audit.record(actor.username(), "EMPLOYEE_OFFBOARDED", "employee:" + employeeId,
                "identityDisabled=" + identityDisabled + " notified=" + fanout.notified()
                        + " failed=" + fanout.failed());
        notifications.create(keycloakId, employeeId, NotificationType.EMPLOYEE_TERMINATED, correlationId);
        return new OffboardingOutcome(employeeId, keycloakId, identityDisabled,
                fanout.notified(), fanout.failed());
    }

    private static String summarize(Throwable e) {
        String message = e.getMessage();
        return e.getClass().getSimpleName() + (message != null ? ": " + message : "");
    }
}
