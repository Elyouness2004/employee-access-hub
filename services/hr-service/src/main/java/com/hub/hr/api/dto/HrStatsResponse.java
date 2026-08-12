package com.hub.hr.api.dto;

/**
 * Aggregate HR KPIs for the analytics context (P6.2). No per-employee detail is
 * exposed — only counts.
 */
public record HrStatsResponse(
        long totalEmployees,
        long activeEmployees,
        long disabledEmployees,
        long departments,
        long positions) {
}
