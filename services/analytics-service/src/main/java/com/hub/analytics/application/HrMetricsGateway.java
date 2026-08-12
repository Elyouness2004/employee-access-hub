package com.hub.analytics.application;

/**
 * Port to hr-service metrics (§2.5). Implementations must degrade gracefully:
 * never throw, return {@link EmployeeSummary#unavailable()} when the source is
 * unreachable and nothing is cached.
 */
public interface HrMetricsGateway {

    EmployeeSummary employeeSummary();
}
