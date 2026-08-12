package com.hub.analytics.application;

import java.util.ArrayList;
import java.util.List;

import com.hub.analytics.api.dto.PowerBiKpiRow;
import org.springframework.stereotype.Service;

/**
 * Builds the flattened Power BI dataset from the aggregated dashboard. Power BI
 * consumes only this REST output (never a database); the payload is a single
 * flat array of {@link PowerBiKpiRow} for a frictionless tabular import. Caching
 * and resilience are inherited from the gateways the dashboard is built on.
 */
@Service
public class PowerBiService {

    private final AnalyticsService analyticsService;

    public PowerBiService(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    public List<PowerBiKpiRow> kpiRows() {
        DashboardSummary dashboard = analyticsService.dashboard();
        List<PowerBiKpiRow> rows = new ArrayList<>();

        EmployeeSummary hr = dashboard.employees();
        rows.add(PowerBiKpiRow.of("hr", "totalEmployees", hr.totalEmployees(), hr.available()));
        rows.add(PowerBiKpiRow.of("hr", "activeEmployees", hr.activeEmployees(), hr.available()));
        rows.add(PowerBiKpiRow.of("hr", "disabledEmployees", hr.disabledEmployees(), hr.available()));
        rows.add(PowerBiKpiRow.of("hr", "departments", hr.departments(), hr.available()));
        rows.add(PowerBiKpiRow.of("hr", "positions", hr.positions(), hr.available()));

        LeaveSummary leave = dashboard.leave();
        rows.add(PowerBiKpiRow.of("leave", "submitted", leave.submitted(), leave.available()));
        rows.add(PowerBiKpiRow.of("leave", "approved", leave.approved(), leave.available()));
        rows.add(PowerBiKpiRow.of("leave", "rejected", leave.rejected(), leave.available()));
        rows.add(PowerBiKpiRow.of("leave", "cancelled", leave.cancelled(), leave.available()));
        rows.add(PowerBiKpiRow.of("leave", "total", leave.total(), leave.available()));

        ExpenseSummary expense = dashboard.expenses();
        rows.add(PowerBiKpiRow.of("expense", "submitted", expense.submitted(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "pendingSecondApproval",
                expense.pendingSecondApproval(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "approved", expense.approved(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "rejected", expense.rejected(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "cancelled", expense.cancelled(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "total", expense.total(), expense.available()));
        rows.add(PowerBiKpiRow.of("expense", "approvedAmount", expense.approvedAmount(), expense.available()));

        DocumentsSummary documents = dashboard.documents();
        rows.add(PowerBiKpiRow.of("documents", "totalDocuments",
                documents.totalDocuments(), documents.available()));
        rows.add(PowerBiKpiRow.of("documents", "sensitiveDocuments",
                documents.sensitiveDocuments(), documents.available()));
        rows.add(PowerBiKpiRow.of("documents", "totalCategories",
                documents.totalCategories(), documents.available()));
        rows.add(PowerBiKpiRow.of("documents", "downloadsLogged",
                documents.downloadsLogged(), documents.available()));

        return rows;
    }
}
