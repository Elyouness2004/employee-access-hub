package com.hub.analytics.application;

/**
 * HR KPIs as analytics sees them. {@code available} is false when hr-service
 * could not be reached and no snapshot was cached — the dashboard still renders,
 * this section just reads as unavailable (graceful degradation, P6.3).
 */
public record EmployeeSummary(
        boolean available,
        long totalEmployees,
        long activeEmployees,
        long disabledEmployees,
        long departments,
        long positions) {

    public static EmployeeSummary unavailable() {
        return new EmployeeSummary(false, 0, 0, 0, 0, 0);
    }
}
