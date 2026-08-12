package com.hub.analytics.application;

import java.time.Instant;

/**
 * The composite dashboard: one section per source, plus the moment it was
 * assembled. Any section may be unavailable without failing the whole response.
 */
public record DashboardSummary(
        EmployeeSummary employees,
        LeaveSummary leave,
        ExpenseSummary expenses,
        DocumentsSummary documents,
        Instant generatedAt) {
}
