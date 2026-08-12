package com.hub.analytics.api;

import java.util.List;

import com.hub.analytics.api.dto.PowerBiKpiRow;
import com.hub.analytics.application.DashboardSummary;
import com.hub.analytics.application.AnalyticsService;
import com.hub.analytics.application.PowerBiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Power BI facade (Part 4). OAuth2-secured, HR/Admin only, optimized payloads,
 * no database exposure — Power BI consumes only these REST endpoints. Responses
 * are cached and resilient by inheritance from the analytics gateways.
 */
@RestController
@RequestMapping("/api/analytics/powerbi")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Power BI")
public class PowerBiController {

    private final PowerBiService powerBiService;
    private final AnalyticsService analyticsService;

    public PowerBiController(PowerBiService powerBiService, AnalyticsService analyticsService) {
        this.powerBiService = powerBiService;
        this.analyticsService = analyticsService;
    }

    @GetMapping("/kpis")
    @Operation(summary = "Flat KPI rows (source, metric, value) — the Power BI tabular dataset")
    public List<PowerBiKpiRow> kpis() {
        return powerBiService.kpiRows();
    }

    @GetMapping("/dashboard")
    @Operation(summary = "The aggregated dashboard as a single optimized payload")
    public DashboardSummary dashboard() {
        return analyticsService.dashboard();
    }
}
