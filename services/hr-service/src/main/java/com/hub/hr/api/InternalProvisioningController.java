package com.hub.hr.api;

import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.ProvisioningHistoryResponse;
import com.hub.hr.api.dto.ProvisioningStatusResponse;
import com.hub.hr.application.IdentityQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service provisioning API (Part 5). Not routed by the gateway:
 * reachable only on the internal backend network, and restricted to HR/Admin
 * tokens like the other sensitive internal endpoints.
 */
@RestController
@RequestMapping("/internal/provisioning")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Internal — service-to-service")
public class InternalProvisioningController {

    private final IdentityQueryService queries;

    public InternalProvisioningController(IdentityQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/{employeeId}")
    @Operation(summary = "Provisioning status of an employee")
    public ProvisioningStatusResponse status(@PathVariable UUID employeeId) {
        return queries.provisioningStatus(employeeId);
    }

    @GetMapping("/{employeeId}/history")
    @Operation(summary = "Provisioning history of an employee")
    public List<ProvisioningHistoryResponse> history(@PathVariable UUID employeeId) {
        return queries.historyFor(employeeId);
    }
}
