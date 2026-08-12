package com.hub.hr.config;

import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.infrastructure.DepartmentRepository;
import com.hub.hr.infrastructure.EmployeeRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Configuration;

/**
 * Business metrics (Phase 5): domain counts published as Micrometer gauges so
 * Grafana can chart headcount next to the RED/JVM signals. The gauges sample the
 * existing repositories on scrape (read-only) — they add no business logic and
 * touch no write path. This is the reference pattern; other services expose
 * their own domain gauges the same way.
 */
@Configuration
public class HrMetricsConfig {

    public HrMetricsConfig(MeterRegistry registry,
                           EmployeeRepository employees,
                           DepartmentRepository departments) {
        Gauge.builder("hub.hr.employees", employees, EmployeeRepository::count)
                .description("Total employee records")
                .register(registry);
        Gauge.builder("hub.hr.employees.active", employees,
                        e -> e.countByStatus(EmployeeStatus.ACTIVE))
                .description("Employees in ACTIVE status")
                .register(registry);
        Gauge.builder("hub.hr.departments", departments, DepartmentRepository::count)
                .description("Total departments")
                .register(registry);
    }
}
