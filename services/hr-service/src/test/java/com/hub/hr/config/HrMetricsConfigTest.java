package com.hub.hr.config;

import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.infrastructure.DepartmentRepository;
import com.hub.hr.infrastructure.EmployeeRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HrMetricsConfigTest {

    @Test
    void registersBusinessGaugesThatSampleTheRepositories() {
        EmployeeRepository employees = mock(EmployeeRepository.class);
        DepartmentRepository departments = mock(DepartmentRepository.class);
        when(employees.count()).thenReturn(7L);
        when(employees.countByStatus(EmployeeStatus.ACTIVE)).thenReturn(5L);
        when(departments.count()).thenReturn(3L);

        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        new HrMetricsConfig(registry, employees, departments);

        assertThat(registry.get("hub.hr.employees").gauge().value()).isEqualTo(7.0);
        assertThat(registry.get("hub.hr.employees.active").gauge().value()).isEqualTo(5.0);
        assertThat(registry.get("hub.hr.departments").gauge().value()).isEqualTo(3.0);
    }
}
