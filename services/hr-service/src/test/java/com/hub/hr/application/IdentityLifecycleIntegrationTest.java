package com.hub.hr.application;

import java.time.LocalDate;
import java.util.UUID;

import com.hub.hr.api.dto.EmployeeRequest;
import com.hub.hr.api.dto.EmployeeResponse;
import com.hub.hr.domain.Department;
import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.Position;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.infrastructure.AuditLogRepository;
import com.hub.hr.infrastructure.DepartmentRepository;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.OutboxEventRepository;
import com.hub.hr.infrastructure.PositionRepository;
import com.hub.hr.infrastructure.ProvisioningRecordRepository;
import com.hub.hr.infrastructure.ProvisioningRecordStatus;
import com.hub.hr.infrastructure.SecurityEventRepository;
import com.hub.hr.support.IdentityTestConfig;
import com.hub.hr.support.RecordingIdentityProvisioner;
import com.hub.hr.support.RecordingOffboardingNotifier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end identity lifecycle on the real H2/Flyway schema, driven through the
 * recording identity/notifier fakes — NOT transactional, because the flow spans
 * several transactions (auto-onboarding AFTER_COMMIT, the REQUIRES_NEW failure
 * journal, the outbox write) whose committed effects are exactly what is asserted.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@Import(IdentityTestConfig.class)
class IdentityLifecycleIntegrationTest {

    @Autowired EmployeeService employeeService;
    @Autowired ProvisioningService provisioningService;
    @Autowired OffboardingService offboardingService;
    @Autowired IdentitySyncService identitySyncService;

    @Autowired EmployeeRepository employees;
    @Autowired DepartmentRepository departments;
    @Autowired PositionRepository positions;
    @Autowired ProvisioningRecordRepository records;
    @Autowired OutboxEventRepository outbox;
    @Autowired AuditLogRepository auditLog;
    @Autowired SecurityEventRepository securityEvents;

    @Autowired RecordingIdentityProvisioner identity;
    @Autowired RecordingOffboardingNotifier notifier;

    private UUID departmentId;
    private UUID positionId;

    @BeforeEach
    void setUp() {
        identity.reset();
        Department department = new Department();
        department.setName("Engineering-" + UUID.randomUUID());
        departmentId = departments.save(department).getId();
        Position position = new Position();
        position.setTitle("Engineer-" + UUID.randomUUID());
        positionId = positions.save(position).getId();
    }

    @AfterEach
    void tearDown() {
        records.deleteAll();
        securityEvents.deleteAll();
        outbox.deleteAll();
        auditLog.deleteAll();
        employees.deleteAll();
        positions.deleteAll();
        departments.deleteAll();
    }

    private Employee seed(EmployeeStatus status, boolean provisioned) {
        Employee employee = new Employee();
        employee.setMatricule("EMP-" + Math.abs(UUID.randomUUID().hashCode()));
        employee.setFirstName("Jane");
        employee.setLastName("Doe");
        employee.setEmail(UUID.randomUUID() + "@corp.test");
        employee.setHireDate(LocalDate.of(2024, 1, 8));
        employee.setStatus(status);
        employee.setDepartmentId(departmentId);
        employee.setPositionId(positionId);
        if (provisioned) {
            employee.setKeycloakId(UUID.randomUUID());
            employee.setProvisioningStatus(ProvisioningStatus.PROVISIONED);
        }
        return employees.save(employee);
    }

    @Test
    void aNewActiveEmployeeIsAutomaticallyProvisioned() {
        EmployeeRequest request = new EmployeeRequest("EMP-AUTO-1", "Ada", "Byron",
                UUID.randomUUID() + "@corp.test", LocalDate.of(2024, 1, 8),
                EmployeeStatus.ACTIVE, null, departmentId, positionId);

        EmployeeResponse created = employeeService.create(request);

        Employee reloaded = employees.findById(created.id()).orElseThrow();
        assertThat(reloaded.getKeycloakId()).isNotNull();
        assertThat(reloaded.getProvisioningStatus()).isEqualTo(ProvisioningStatus.PROVISIONED);
        assertThat(identity.created).hasSize(1);
        assertThat(outbox.findAll()).anyMatch(e -> e.getType().equals("employee.provisioned"));
        assertThat(auditLog.findAll()).anyMatch(a -> a.getAction().equals("EMPLOYEE_PROVISIONED"));
    }

    @Test
    void aProvisioningFailureLeavesNoHalfCreatedAccount() {
        Employee employee = seed(EmployeeStatus.ACTIVE, false);
        identity.failOnCreate = true;   // the fake models an unreachable provider

        // 503, not 502: the provider was never reached, so there is nothing about
        // the record for an operator to review (api-conventions keeps them apart).
        assertThatThrownBy(() -> provisioningService.provision(Actor.system(), employee.getId()))
                .isInstanceOf(com.hub.hr.domain.identity.IdentityUnavailableException.class);

        Employee reloaded = employees.findById(employee.getId()).orElseThrow();
        assertThat(reloaded.getKeycloakId()).isNull();
        assertThat(reloaded.getProvisioningStatus()).isEqualTo(ProvisioningStatus.FAILED);
        assertThat(records.findAllByEmployeeIdOrderByOccurredAtAsc(employee.getId()))
                .anyMatch(r -> r.getStatus() == ProvisioningRecordStatus.FAILED);
    }

    @Test
    void provisioningIsIdempotent() {
        Employee employee = seed(EmployeeStatus.ACTIVE, false);

        provisioningService.provision(Actor.system(), employee.getId());
        ProvisioningOutcome second = provisioningService.provision(Actor.system(), employee.getId());

        assertThat(second.alreadyProvisioned()).isTrue();
        assertThat(identity.created).hasSize(1);
        assertThat(employees.findById(employee.getId()).orElseThrow().getProvisioningStatus())
                .isEqualTo(ProvisioningStatus.PROVISIONED);
    }

    @Test
    void aFailedAccountCanBeReprovisioned() {
        Employee employee = seed(EmployeeStatus.ACTIVE, false);
        identity.failOnCreate = true;
        assertThatThrownBy(() -> provisioningService.provision(Actor.system(), employee.getId()))
                .isInstanceOf(com.hub.hr.domain.identity.IdentityUnavailableException.class);

        identity.failOnCreate = false;
        ProvisioningOutcome retry = provisioningService.provision(Actor.system(), employee.getId());

        assertThat(retry.alreadyProvisioned()).isFalse();
        Employee reloaded = employees.findById(employee.getId()).orElseThrow();
        assertThat(reloaded.getKeycloakId()).isNotNull();
        assertThat(reloaded.getProvisioningStatus()).isEqualTo(ProvisioningStatus.PROVISIONED);
    }

    @Test
    void offboardingDisablesTheAccountAndFansOut() {
        Employee employee = seed(EmployeeStatus.ACTIVE, true);
        UUID keycloakId = employee.getKeycloakId();

        OffboardingOutcome outcome = offboardingService.offboard(Actor.system(), employee.getId());

        assertThat(outcome.identityDisabled()).isTrue();
        assertThat(outcome.notified()).contains("leave", "expense", "documents");
        assertThat(identity.disabled).contains(keycloakId);
        assertThat(identity.loggedOut).contains(keycloakId);
        assertThat(notifier.notifiedFor).contains(keycloakId);
        Employee reloaded = employees.findById(employee.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(EmployeeStatus.TERMINATED);
        assertThat(reloaded.getProvisioningStatus()).isEqualTo(ProvisioningStatus.DISABLED);
        assertThat(outbox.findAll()).anyMatch(e -> e.getType().equals("employee.offboarded"));
    }

    @Test
    void aSyncFailureIsRecordedButTheEventIsStillEmitted() {
        Employee employee = seed(EmployeeStatus.ACTIVE, true);
        identity.failOnUpdate = true;
        employee.setStatus(EmployeeStatus.DISABLED);
        employees.save(employee);

        identitySyncService.sync(Actor.system(), employee.getId()); // best-effort: must not throw

        assertThat(records.findAllByEmployeeIdOrderByOccurredAtAsc(employee.getId()))
                .anyMatch(r -> r.getStatus() == ProvisioningRecordStatus.FAILED && r.getAction().equals("SYNC"));
        assertThat(outbox.findAll()).anyMatch(e -> e.getType().equals("employee.updated"));
    }

    @Test
    void offboardingAnUnprovisionedEmployeeStillTerminatesWithoutFanout() {
        Employee employee = seed(EmployeeStatus.ACTIVE, false);

        OffboardingOutcome outcome = offboardingService.offboard(Actor.system(), employee.getId());

        assertThat(outcome.identityDisabled()).isFalse();
        assertThat(outcome.notified()).isEmpty();
        assertThat(notifier.notifiedFor).isEmpty();
        assertThat(employees.findById(employee.getId()).orElseThrow().getStatus())
                .isEqualTo(EmployeeStatus.TERMINATED);
        assertThat(outbox.findAll()).anyMatch(e -> e.getType().equals("employee.offboarded"));
    }

    @Test
    void syncIsANoopForAnUnprovisionedEmployee() {
        Employee employee = seed(EmployeeStatus.ACTIVE, false);

        identitySyncService.sync(Actor.system(), employee.getId());

        assertThat(identity.updated).isEmpty();
        assertThat(outbox.findAll()).noneMatch(e -> e.getAggregateId().equals(employee.getId()));
    }

    @Test
    void synchronizationPushesStatusToKeycloakAndEmitsEvent() {
        Employee employee = seed(EmployeeStatus.ACTIVE, true);
        UUID keycloakId = employee.getKeycloakId();
        employee.setStatus(EmployeeStatus.DISABLED);
        employees.save(employee);

        identitySyncService.sync(Actor.system(), employee.getId());

        assertThat(identity.updated).contains(keycloakId);
        assertThat(identity.disabled).contains(keycloakId);
        Employee reloaded = employees.findById(employee.getId()).orElseThrow();
        assertThat(reloaded.getProvisioningStatus()).isEqualTo(ProvisioningStatus.DISABLED);
        assertThat(reloaded.getLastSyncAt()).isNotNull();
        assertThat(outbox.findAll()).anyMatch(e -> e.getType().equals("employee.updated"));
    }
}
