package com.hub.hr.application;

import com.hub.hr.domain.Employee;
import com.hub.hr.infrastructure.EmployeeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RealmRoleResolverTest {

    @Mock
    EmployeeRepository employees;

    @Test
    void anEmployeeWithDirectReportsResolvesToManager() {
        RealmRoleResolver resolver = new RealmRoleResolver(employees);
        Employee employee = new Employee();
        when(employees.existsByManagerId(employee.getId())).thenReturn(true);
        assertThat(resolver.resolve(employee)).isEqualTo("MANAGER");
    }

    @Test
    void anEmployeeWithoutReportsResolvesToEmployee() {
        RealmRoleResolver resolver = new RealmRoleResolver(employees);
        Employee employee = new Employee();
        when(employees.existsByManagerId(employee.getId())).thenReturn(false);
        assertThat(resolver.resolve(employee)).isEqualTo("EMPLOYEE");
    }
}
