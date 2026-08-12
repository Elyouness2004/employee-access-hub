package com.hub.leave.api.dto;

/**
 * Aggregate leave KPIs for the analytics context (P6.2). No per-employee detail
 * is exposed — only counts.
 */
public record LeaveStatsResponse(
        long submitted,
        long approved,
        long rejected,
        long cancelled,
        long total) {
}
