package com.hub.hr.api;

import com.hub.hr.api.dto.HrStatsResponse;
import com.hub.hr.application.EmployeeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service stats API (P6.2). Not routed by the gateway: reachable only
 * on the internal backend network, called by analytics-service with an HR/Admin
 * token relayed — hence the HR/ADMIN requirement.
 */
@RestController
@RequestMapping("/internal/stats")
@Tag(name = "Internal — service-to-service")
public class InternalStatsController {

    private final EmployeeService employeeService;

    public InternalStatsController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Aggregate HR KPIs for the analytics context")
    public HrStatsResponse stats() {
        return employeeService.stats();
    }
}
