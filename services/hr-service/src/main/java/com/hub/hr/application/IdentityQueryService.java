package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.IdentityLinkResponse;
import com.hub.hr.api.dto.OutboxEventResponse;
import com.hub.hr.api.dto.ProvisioningHistoryResponse;
import com.hub.hr.api.dto.ProvisioningStatusResponse;
import com.hub.hr.api.dto.SecurityEventResponse;
import com.hub.hr.domain.Employee;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.OutboxEventRepository;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.SecurityEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of the identity lifecycle: provisioning status/history, identity
 * links, security-event history and the outbox trail, feeding the admin (Part 7)
 * and internal (Part 5) APIs.
 */
@Service
@Transactional(readOnly = true)
public class IdentityQueryService {

    private final EmployeeRepository employees;
    private final ProvisioningRecordRepository records;
    private final SecurityEventRepository securityEvents;
    private final OutboxEventRepository outbox;
    private final RealmRoleResolver roleResolver;

    public IdentityQueryService(EmployeeRepository employees,
                                ProvisioningRecordRepository records,
                                SecurityEventRepository securityEvents,
                                OutboxEventRepository outbox,
                                RealmRoleResolver roleResolver) {
        this.employees = employees;
        this.records = records;
        this.securityEvents = securityEvents;
        this.outbox = outbox;
        this.roleResolver = roleResolver;
    }

    public ProvisioningStatusResponse provisioningStatus(UUID employeeId) {
        Employee employee = require(employeeId);
        return ProvisioningStatusResponse.from(employee, roleResolver.resolve(employee));
    }

    /**
     * The state after an action that sends an account e-mail, carrying whether it
     * was delivered. Separate from the plain read because "sent" is a fact about
     * the action just performed, not a property of the employee.
     */
    public ProvisioningStatusResponse provisioningStatus(UUID employeeId, Boolean activationEmailSent) {
        Employee employee = require(employeeId);
        return ProvisioningStatusResponse.from(employee, roleResolver.resolve(employee), activationEmailSent);
    }

    public List<ProvisioningHistoryResponse> historyFor(UUID employeeId) {
        require(employeeId);
        return records.findAllByEmployeeIdOrderByOccurredAtAsc(employeeId).stream()
                .map(ProvisioningHistoryResponse::from).toList();
    }

    public List<ProvisioningHistoryResponse> recentHistory() {
        return records.findTop100ByOrderByOccurredAtDesc().stream()
                .map(ProvisioningHistoryResponse::from).toList();
    }

    public List<SecurityEventResponse> securityEventsFor(UUID employeeId) {
        Employee employee = require(employeeId);
        return securityEvents.findAllByKeycloakIdOrderByOccurredAtAsc(employee.getKeycloakId()).stream()
                .map(SecurityEventResponse::from).toList();
    }

    public List<SecurityEventResponse> recentSecurityEvents() {
        return securityEvents.findTop100ByOrderByOccurredAtDesc().stream()
                .map(SecurityEventResponse::from).toList();
    }

    public List<IdentityLinkResponse> identityLinks() {
        return employees.findAllByKeycloakIdIsNotNullOrderByMatriculeAsc().stream()
                .map(IdentityLinkResponse::from).toList();
    }

    public List<OutboxEventResponse> recentEvents() {
        return outbox.findTop100ByOrderByCreatedAtDesc().stream()
                .map(OutboxEventResponse::from).toList();
    }

    private Employee require(UUID employeeId) {
        return employees.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
    }
}
