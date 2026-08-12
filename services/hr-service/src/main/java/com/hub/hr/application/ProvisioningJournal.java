package com.hub.hr.application;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.event.DomainEventPublisher;
import com.hub.hr.domain.event.EmployeeProvisioned;
import com.hub.hr.domain.notification.NotificationType;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.ProvisioningRecord;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.ProvisioningRecordStatus;
import com.hub.hr.infrastructure.SecurityEvent;
import com.hub.hr.infrastructure.SecurityEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistence side of provisioning, split from {@link ProvisioningService} on
 * purpose: the identity provider is called OUTSIDE any transaction, then the
 * outcome is committed here. Success writes the identity link, a history row, the
 * outbox event, the security event and the audit entry in ONE transaction; failure
 * is committed in an INDEPENDENT transaction (REQUIRES_NEW) so the FAILED history
 * survives even though the caller then throws — the "never leave inconsistent
 * state" rule.
 *
 * <p>The employee → Keycloak link and the {@code EmployeeProvisioned} outbox event
 * are written in the same transaction on purpose: that is the outbox pattern's
 * whole point. Either the link and the event both exist, or neither does; the
 * relay can then be as unreliable as it likes without the two drifting apart.
 */
@Component
public class ProvisioningJournal {

    private final EmployeeRepository employees;
    private final ProvisioningRecordRepository records;
    private final SecurityEventRepository securityEvents;
    private final DomainEventPublisher events;
    private final AuditTrail audit;
    private final NotificationService notifications;

    public ProvisioningJournal(EmployeeRepository employees,
                               ProvisioningRecordRepository records,
                               SecurityEventRepository securityEvents,
                               DomainEventPublisher events,
                               AuditTrail audit,
                               NotificationService notifications) {
        this.employees = employees;
        this.records = records;
        this.securityEvents = securityEvents;
        this.events = events;
        this.audit = audit;
        this.notifications = notifications;
    }

    @Transactional
    public void recordProvisioned(UUID employeeId, UUID keycloakId, String role,
                                  Actor actor, String correlationId,
                                  boolean accountCreated, boolean activationEmailSent) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
        employee.setKeycloakId(keycloakId);
        employee.setProvisioningStatus(ProvisioningStatus.PROVISIONED);
        employee.setProvisionedAt(Instant.now());
        employees.save(employee);

        String detail = "role=" + role
                + " account=" + (accountCreated ? "created" : "adopted")
                + " activationEmail=" + (activationEmailSent ? "sent" : "not sent");
        records.save(new ProvisioningRecord(employeeId, keycloakId, "ONBOARD",
                accountCreated ? ProvisioningRecordStatus.PROVISIONED : ProvisioningRecordStatus.LINKED,
                detail));
        securityEvents.save(new SecurityEvent(keycloakId, employee.getEmail(), "PROVISIONED",
                actor.username(), detail));
        events.publish(EmployeeProvisioned.of(employeeId, keycloakId, employee.getEmail(), role, correlationId));
        audit.record(actor.username(), "EMPLOYEE_PROVISIONED", "employee:" + employeeId,
                "keycloakId=" + keycloakId + " " + detail);
        notifications.create(keycloakId, employeeId, NotificationType.EMPLOYEE_PROVISIONED, correlationId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID employeeId, String action, Actor actor, String message) {
        employees.findById(employeeId).ifPresent(employee -> {
            employee.setProvisioningStatus(ProvisioningStatus.FAILED);
            employees.save(employee);
        });
        records.save(new ProvisioningRecord(employeeId, null, action,
                ProvisioningRecordStatus.FAILED, message));
        audit.record(actor.username(), action + "_FAILED", "employee:" + employeeId, message);
    }
}
