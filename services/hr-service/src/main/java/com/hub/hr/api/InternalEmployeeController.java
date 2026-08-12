package com.hub.hr.api;

import java.util.UUID;

import com.hub.hr.api.dto.InternalEmployeeResponse;
import com.hub.hr.application.EmployeeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service API (P2.6). Not routed by the gateway: reachable only on
 * the internal backend network, called by leave/expense with the caller's own
 * token relayed — any authenticated hub-api token suffices, no extra role
 * (an employee may resolve their own manager link this way).
 */
@RestController
@RequestMapping("/internal/employees")
@Tag(name = "Internal — service-to-service")
public class InternalEmployeeController {

    private final EmployeeService employeeService;

    public InternalEmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping("/{id}")
    @Operation(summary = "Employee snapshot (status + manager link) by employee id")
    public InternalEmployeeResponse byId(@PathVariable UUID id) {
        return employeeService.internalGet(id);
    }

    @GetMapping("/by-keycloak/{keycloakId}")
    @Operation(summary = "Employee snapshot by Keycloak subject (identity link)")
    public InternalEmployeeResponse byKeycloakId(@PathVariable UUID keycloakId) {
        return employeeService.internalGetByKeycloakId(keycloakId);
    }
}
