package com.hub.hr.application;

import com.hub.hr.domain.Employee;
import com.hub.hr.infrastructure.EmployeeRepository;
import org.springframework.stereotype.Component;

/**
 * Decides which realm role an employee's account should hold (P3.2 / role
 * synchronization). Composite roles mean MANAGER ⊃ EMPLOYEE, so managers (anyone
 * with at least one direct report) get MANAGER and everyone else EMPLOYEE. HR and
 * ADMIN are assigned deliberately by administrators, never derived here.
 */
@Component
public class RealmRoleResolver {

    public static final String EMPLOYEE = "EMPLOYEE";
    public static final String MANAGER = "MANAGER";

    private final EmployeeRepository employees;

    public RealmRoleResolver(EmployeeRepository employees) {
        this.employees = employees;
    }

    public String resolve(Employee employee) {
        return employees.existsByManagerId(employee.getId()) ? MANAGER : EMPLOYEE;
    }
}
