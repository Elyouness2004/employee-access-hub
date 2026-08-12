package com.hub.hr.domain;

import java.util.UUID;

import com.hub.hr.domain.event.EmployeeOffboarded;
import com.hub.hr.domain.event.EmployeeProvisioned;
import com.hub.hr.domain.event.EmployeeUpdated;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DomainEventsTest {

    private final UUID employeeId = UUID.randomUUID();
    private final UUID keycloakId = UUID.randomUUID();

    @Test
    void provisionedEventCarriesStableIdentityAndType() {
        EmployeeProvisioned event = EmployeeProvisioned.of(employeeId, keycloakId, "a@b.c", "EMPLOYEE", "corr-1");
        assertThat(event.type()).isEqualTo("employee.provisioned");
        assertThat(event.eventId()).isNotNull();
        assertThat(event.aggregateId()).isEqualTo(employeeId);
        assertThat(event.keycloakId()).isEqualTo(keycloakId);
        assertThat(event.correlationId()).isEqualTo("corr-1");
        assertThat(event.occurredAt()).isNotNull();
    }

    @Test
    void updatedEventCarriesStatusAndEnabledFlag() {
        EmployeeUpdated event = EmployeeUpdated.of(employeeId, keycloakId, "a@b.c", "DISABLED", false, "corr-2");
        assertThat(event.type()).isEqualTo("employee.updated");
        assertThat(event.status()).isEqualTo("DISABLED");
        assertThat(event.enabled()).isFalse();
        assertThat(event.correlationId()).isEqualTo("corr-2");
    }

    @Test
    void offboardedEventCarriesType() {
        EmployeeOffboarded event = EmployeeOffboarded.of(employeeId, keycloakId, "a@b.c", "corr-3");
        assertThat(event.type()).isEqualTo("employee.offboarded");
        assertThat(event.aggregateId()).isEqualTo(employeeId);
    }

    @Test
    void distinctEventsGetDistinctIds() {
        EmployeeProvisioned first = EmployeeProvisioned.of(employeeId, keycloakId, "a@b.c", "EMPLOYEE", "c");
        EmployeeProvisioned second = EmployeeProvisioned.of(employeeId, keycloakId, "a@b.c", "EMPLOYEE", "c");
        assertThat(first.eventId()).isNotEqualTo(second.eventId());
    }
}
