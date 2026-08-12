package com.hub.analytics.infrastructure;

import com.hub.analytics.application.EmployeeSummary;

/** Wire shape of hr-service's HrStatsResponse. */
public record HrStatsDto(
        long totalEmployees,
        long activeEmployees,
        long disabledEmployees,
        long departments,
        long positions) {

    public EmployeeSummary toSummary() {
        return new EmployeeSummary(true, totalEmployees, activeEmployees, disabledEmployees,
                departments, positions);
    }
}
