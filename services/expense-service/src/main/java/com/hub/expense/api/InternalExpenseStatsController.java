package com.hub.expense.api;

import com.hub.expense.api.dto.ExpenseStatsResponse;
import com.hub.expense.application.ExpenseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service stats API (P6.2). Not routed by the gateway: reachable only
 * on the internal backend network, called by analytics-service with an HR/Admin
 * token relayed — hence the HR/ADMIN requirement, matching who may read
 * reporting data at all.
 */
@RestController
@RequestMapping("/internal/stats")
@Tag(name = "Internal — service-to-service")
public class InternalExpenseStatsController {

    private final ExpenseService expenseService;

    public InternalExpenseStatsController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Aggregate expense KPIs for the analytics context")
    public ExpenseStatsResponse stats() {
        return expenseService.stats();
    }
}
