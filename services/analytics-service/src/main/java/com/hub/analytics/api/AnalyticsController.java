package com.hub.analytics.api;

import com.hub.analytics.application.AnalyticsService;
import com.hub.analytics.application.DashboardSummary;
import com.hub.analytics.application.DocumentsSummary;
import com.hub.analytics.application.EmployeeSummary;
import com.hub.analytics.application.ExpenseSummary;
import com.hub.analytics.application.LeaveSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reporting APIs (P6.4) — HR/Admin only. Every response is assembled purely from
 * the downstream services' secured REST APIs; any single source may be
 * unavailable without failing the request.
 */
@RestController
@RequestMapping("/api/analytics")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/dashboard")
    @Operation(summary = "Full KPI dashboard aggregated across all sources")
    public DashboardSummary dashboard() {
        return analyticsService.dashboard();
    }

    @GetMapping("/employees")
    @Operation(summary = "HR headcount KPIs")
    public EmployeeSummary employees() {
        return analyticsService.employees();
    }

    @GetMapping("/leave-summary")
    @Operation(summary = "Leave request KPIs")
    public LeaveSummary leaveSummary() {
        return analyticsService.leaveSummary();
    }

    @GetMapping("/expense-summary")
    @Operation(summary = "Expense claim KPIs including approved spend")
    public ExpenseSummary expenseSummary() {
        return analyticsService.expenseSummary();
    }

    @GetMapping("/documents-summary")
    @Operation(summary = "Document and download KPIs")
    public DocumentsSummary documentsSummary() {
        return analyticsService.documentsSummary();
    }
}
