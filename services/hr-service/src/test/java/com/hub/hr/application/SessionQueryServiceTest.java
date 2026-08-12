package com.hub.hr.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.hub.hr.api.dto.SessionResponse;
import com.hub.hr.domain.Employee;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.SessionDetail;
import com.hub.hr.infrastructure.SessionDetailRepository;
import com.hub.hr.support.RecordingSessionDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionQueryServiceTest {

    @Mock
    SessionDetailRepository details;
    @Mock
    EmployeeRepository employees;

    RecordingSessionDirectory directory = new RecordingSessionDirectory();
    SessionQueryService service;

    final UUID keycloakId = UUID.randomUUID();
    final Actor actor = new Actor(keycloakId, "jane.doe", false);

    @BeforeEach
    void setUp() {
        directory.reset();
        service = new SessionQueryService(directory, details, employees);
    }

    @Test
    void mySessionsMergeTheLocalDeviceDetailAndFlagTheCurrentSession() {
        directory.seed("s1", keycloakId);
        when(details.findAllBySessionIdIn(any())).thenReturn(List.of(
                new SessionDetail("s1", keycloakId, "Chrome", "Windows", "Desktop", "ua", true)));

        List<SessionResponse> result = service.mySessions(actor, "s1");

        assertThat(result).hasSize(1);
        SessionResponse session = result.get(0);
        assertThat(session.id()).isEqualTo("s1");
        assertThat(session.browser()).isEqualTo("Chrome");
        assertThat(session.operatingSystem()).isEqualTo("Windows");
        assertThat(session.mfaUsed()).isTrue();
        assertThat(session.current()).isTrue();
    }

    @Test
    void mySessionsFlagOnlyTheSessionMatchingTheTokenSid() {
        directory.seed("s1", keycloakId);
        directory.seed("s2", keycloakId);

        List<SessionResponse> result = service.mySessions(actor, "s2");

        assertThat(result).extracting(SessionResponse::id).containsExactlyInAnyOrder("s1", "s2");
        assertThat(result.stream().filter(SessionResponse::current).map(SessionResponse::id).toList())
                .containsExactly("s2");
    }

    @Test
    void singleSessionReturnsWhenOwned() {
        directory.seed("s1", keycloakId);
        when(details.findById("s1")).thenReturn(Optional.empty());

        SessionResponse session = service.session(actor, "s1", "s1");

        assertThat(session.id()).isEqualTo("s1");
        assertThat(session.current()).isTrue();
        assertThat(session.browser()).isNull();
    }

    @Test
    void singleSessionIsNotFoundWhenNotTheCallersOwn() {
        directory.seed("someone-else", UUID.randomUUID());

        assertThatThrownBy(() -> service.session(actor, "someone-else", "x"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void adminSessionsOfAProvisionedEmployeeAreReturned() {
        UUID employeeId = UUID.randomUUID();
        UUID employeeKeycloakId = UUID.randomUUID();
        Employee employee = new Employee();
        employee.setKeycloakId(employeeKeycloakId);
        when(employees.findById(employeeId)).thenReturn(Optional.of(employee));
        directory.seed("emp-s1", employeeKeycloakId);

        List<SessionResponse> result = service.sessionsOf(employeeId);

        assertThat(result).extracting(SessionResponse::id).containsExactly("emp-s1");
    }

    @Test
    void adminSessionsOfANonProvisionedEmployeeIsRejected() {
        UUID employeeId = UUID.randomUUID();
        when(employees.findById(employeeId)).thenReturn(Optional.of(new Employee()));

        assertThatThrownBy(() -> service.sessionsOf(employeeId))
                .isInstanceOf(EmployeeNotProvisionedException.class);
    }

    @Test
    void adminSessionsOfAnUnknownEmployeeIsNotFound() {
        UUID employeeId = UUID.randomUUID();
        when(employees.findById(employeeId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.sessionsOf(employeeId))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
