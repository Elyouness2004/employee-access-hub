package com.hub.analytics.application;

import java.time.Instant;

import org.springframework.stereotype.Service;

/**
 * READ-ONLY aggregation. Each per-source method delegates to a gateway that
 * already applies the circuit breaker, timeouts and snapshot cache; the
 * dashboard simply composes them, tolerating any unavailable source.
 */
@Service
public class AnalyticsService {

    private final HrMetricsGateway hr;
    private final LeaveMetricsGateway leave;
    private final ExpenseMetricsGateway expense;
    private final DocumentsMetricsGateway documents;

    public AnalyticsService(HrMetricsGateway hr,
                            LeaveMetricsGateway leave,
                            ExpenseMetricsGateway expense,
                            DocumentsMetricsGateway documents) {
        this.hr = hr;
        this.leave = leave;
        this.expense = expense;
        this.documents = documents;
    }

    public EmployeeSummary employees() {
        return hr.employeeSummary();
    }

    public LeaveSummary leaveSummary() {
        return leave.leaveSummary();
    }

    public ExpenseSummary expenseSummary() {
        return expense.expenseSummary();
    }

    public DocumentsSummary documentsSummary() {
        return documents.documentsSummary();
    }

    /** Compose the full dashboard; each section degrades independently (P6.3). */
    public DashboardSummary dashboard() {
        return new DashboardSummary(
                hr.employeeSummary(),
                leave.leaveSummary(),
                expense.expenseSummary(),
                documents.documentsSummary(),
                Instant.now());
    }
}
