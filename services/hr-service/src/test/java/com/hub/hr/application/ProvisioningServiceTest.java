package com.hub.hr.application;

import java.util.Optional;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;
import com.hub.hr.domain.identity.NewIdentity;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.support.RecordingIdentityProvisioner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProvisioningServiceTest {

    @Mock
    EmployeeRepository employees;
    @Mock
    RealmRoleResolver roleResolver;
    @Mock
    ProvisioningJournal journal;

    RecordingIdentityProvisioner identity = new RecordingIdentityProvisioner();
    ProvisioningService service;

    final UUID employeeId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        identity.reset();
        service = new ProvisioningService(employees, identity, roleResolver,
                new RealmRoleSynchronizer(identity), journal, true);
        lenient().when(roleResolver.resolve(any())).thenReturn("EMPLOYEE");
        lenient().when(employees.findByKeycloakId(any())).thenReturn(Optional.empty());
    }

    private Employee activeEmployee() {
        Employee employee = new Employee();
        employee.setEmail("jane.doe@corp.test");
        employee.setFirstName("Jane");
        employee.setLastName("Doe");
        employee.setStatus(EmployeeStatus.ACTIVE);
        return employee;
    }

    @Test
    void provisionsWithNoCredentialForcedPasswordSetupUnverifiedEmailAndRole() {
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        ProvisioningOutcome outcome = service.provision(Actor.system(), employeeId);

        assertThat(identity.created).hasSize(1);
        NewIdentity request = identity.created.get(0);
        assertThat(request.username()).isEqualTo("jane.doe@corp.test");
        assertThat(request.emailVerified()).isFalse();
        assertThat(request.requirePasswordUpdate()).isTrue();
        assertThat(request.realmRole()).isEqualTo("EMPLOYEE");
        // The account is created with NO credential — there is no temporary
        // password to leak, because none is generated.
        assertThat(request.temporaryPassword()).isNull();
        assertThat(request.hasCredential()).isFalse();
        assertThat(identity.assignedRoles).containsExactly("EMPLOYEE");
        assertThat(identity.requiredActions).contains(ProvisioningService.UPDATE_PASSWORD);
        assertThat(identity.actionEmails).containsExactly(java.util.List.of(ProvisioningService.UPDATE_PASSWORD));
        assertThat(outcome.alreadyProvisioned()).isFalse();
        assertThat(outcome.accountCreated()).isTrue();
        assertThat(outcome.activationEmailSent()).isTrue();
        verify(journal).recordProvisioned(eq(employeeId), any(UUID.class), eq("EMPLOYEE"), any(), anyString(),
                eq(true), eq(true));
    }

    @Test
    void anExistingKeycloakAccountIsAdoptedRatherThanDuplicated() {
        UUID existing = identity.givenExistingAccount("jane.doe@corp.test", "EMPLOYEE");
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        ProvisioningOutcome outcome = service.provision(Actor.system(), employeeId);

        assertThat(outcome.keycloakId()).isEqualTo(existing);
        assertThat(outcome.accountCreated()).isFalse();
        assertThat(identity.created).isEmpty();          // no second Keycloak user
        assertThat(identity.updated).containsExactly(existing); // realigned with the HR record

        // Adoption is a LINKING operation and must not touch credentials. Forcing
        // UPDATE_PASSWORD here would lock the owner out — Keycloak refuses to
        // authenticate an account with a pending required action — and mailing a
        // "set your password" link to somebody who already has one is noise.
        assertThat(identity.requiredActions).isEmpty();
        assertThat(identity.actionEmails).isEmpty();
        assertThat(outcome.activationEmailSent()).isFalse();
        verify(journal).recordProvisioned(eq(employeeId), eq(existing), eq("EMPLOYEE"), any(), anyString(),
                eq(false), eq(false));
    }

    @Test
    void anAccountWhoseUsernameDiffersFromTheEmailIsStillAdopted() {
        // The realm's seeded users are exactly this shape: username
        // "alice.employee", e-mail "alice.employee@hub.local". A username-only
        // lookup misses them and tries to CREATE, which Keycloak refuses because
        // the realm forbids duplicate e-mails — leaving the employee permanently
        // unprovisionable. Found by running the lifecycle against a real Keycloak.
        UUID existing = identity.givenExistingAccountWithEmail("jane.doe", "jane.doe@corp.test", "EMPLOYEE");
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        ProvisioningOutcome outcome = service.provision(Actor.system(), employeeId);

        assertThat(outcome.keycloakId()).isEqualTo(existing);
        assertThat(outcome.accountCreated()).isFalse();
        assertThat(identity.created).isEmpty();
    }

    @Test
    void anAccountAlreadyLinkedToAnotherEmployeeIsRefused() {
        UUID existing = identity.givenExistingAccount("jane.doe@corp.test", "EMPLOYEE");
        // Employee's id is assigned by the persistence layer and has no setter, so
        // the "somebody else already owns this account" row is a stub.
        Employee otherEmployee = org.mockito.Mockito.mock(Employee.class);
        when(otherEmployee.getId()).thenReturn(UUID.randomUUID());
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));
        when(employees.findByKeycloakId(existing)).thenReturn(Optional.of(otherEmployee));

        assertThatThrownBy(() -> service.provision(Actor.system(), employeeId))
                .isInstanceOf(ProvisioningException.class)
                .hasMessageContaining("already linked to employee");

        // Nothing was created, and — critically — the other employee's account was
        // NOT deleted by the compensation path.
        assertThat(identity.created).isEmpty();
        assertThat(identity.deleted).isEmpty();
        verify(journal).recordFailure(eq(employeeId), eq("ONBOARD"), any(), anyString());
        verify(journal, never()).recordProvisioned(any(), any(), any(), any(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void aFailedActivationEmailStillLeavesAUsableProvisionedAccount() {
        identity.failOnActionEmail = true;
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        ProvisioningOutcome outcome = service.provision(Actor.system(), employeeId);

        assertThat(outcome.activationEmailSent()).isFalse();
        assertThat(identity.created).hasSize(1);
        assertThat(identity.requiredActions).contains(ProvisioningService.UPDATE_PASSWORD);
        assertThat(identity.deleted).isEmpty();  // a dead mail server must not undo the account
        verify(journal).recordProvisioned(eq(employeeId), any(UUID.class), eq("EMPLOYEE"), any(), anyString(),
                eq(true), eq(false));
    }

    @Test
    void alreadyProvisionedIsAnIdempotentNoop() {
        Employee employee = activeEmployee();
        employee.setKeycloakId(UUID.randomUUID());
        employee.setProvisioningStatus(ProvisioningStatus.PROVISIONED);
        when(employees.findById(employeeId)).thenReturn(Optional.of(employee));

        ProvisioningOutcome outcome = service.provision(Actor.system(), employeeId);

        assertThat(outcome.alreadyProvisioned()).isTrue();
        assertThat(identity.created).isEmpty();
        assertThat(identity.actionEmails).isEmpty();  // no second activation mail
        verifyNoInteractions(journal);
    }

    @Test
    void aNonActiveEmployeeCannotBeProvisioned() {
        Employee employee = activeEmployee();
        employee.setStatus(EmployeeStatus.DISABLED);
        when(employees.findById(employeeId)).thenReturn(Optional.of(employee));

        assertThatThrownBy(() -> service.provision(Actor.system(), employeeId))
                .isInstanceOf(ProvisioningException.class);
        assertThat(identity.created).isEmpty();
        verifyNoInteractions(journal);
    }

    @Test
    void anUnreachableProviderSurfacesAsUnavailableNotAsAProvisioningFailure() {
        identity.failOnCreate = true;   // the fake models "Keycloak did not answer"
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        // 503, not 502. "Review the record and retry" and "the provider is down,
        // wait" send an operator to two different places, and only one of them
        // has anything to fix — api-conventions forbids merging them.
        assertThatThrownBy(() -> service.provision(Actor.system(), employeeId))
                .isInstanceOf(com.hub.hr.domain.identity.IdentityUnavailableException.class);

        assertThat(identity.deleted).isEmpty(); // nothing to compensate: no id was returned
        verify(journal).recordFailure(eq(employeeId), eq("ONBOARD"), any(), anyString());
        verify(journal, never()).recordProvisioned(any(), any(), any(), any(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void anAssignRoleFailureCompensatesTheCreatedAccount() {
        identity.failOnAssignRole = true;
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        assertThatThrownBy(() -> service.provision(Actor.system(), employeeId))
                .isInstanceOf(com.hub.hr.domain.identity.IdentityUnavailableException.class);

        assertThat(identity.created).hasSize(1);
        assertThat(identity.deleted).hasSize(1); // compensating delete of the created user
        verify(journal).recordFailure(eq(employeeId), eq("ONBOARD"), any(), anyString());
        verify(journal, never()).recordProvisioned(any(), any(), any(), any(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void aProviderRefusalIsAProvisioningFailureRatherThanAnOutage() {
        // Not an IdentityUnavailableException: Keycloak WAS reached and said no.
        RecordingIdentityProvisioner refusing = new RecordingIdentityProvisioner() {
            @Override
            public java.util.UUID createUser(com.hub.hr.domain.identity.NewIdentity newIdentity) {
                throw new IllegalStateException("Keycloak rejected the representation");
            }
        };
        ProvisioningService refusingService = new ProvisioningService(employees, refusing, roleResolver,
                new RealmRoleSynchronizer(refusing), journal, true);
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        assertThatThrownBy(() -> refusingService.provision(Actor.system(), employeeId))
                .isInstanceOf(ProvisioningException.class);
        verify(journal).recordFailure(eq(employeeId), eq("ONBOARD"), any(), anyString());
    }

    @Test
    void anAdoptedAccountIsNeverDeletedWhenAlaterStepFails() {
        UUID existing = identity.givenExistingAccount("jane.doe@corp.test");
        identity.failOnAssignRole = true;
        when(employees.findById(employeeId)).thenReturn(Optional.of(activeEmployee()));

        assertThatThrownBy(() -> service.provision(Actor.system(), employeeId))
                .isInstanceOf(com.hub.hr.domain.identity.IdentityUnavailableException.class);

        // Compensation deletes only what THIS attempt created. Deleting an account
        // that already existed would destroy a real user over a failed role call.
        assertThat(identity.deleted).doesNotContain(existing);
        assertThat(identity.deleted).isEmpty();
    }
}
