package com.hub.expense.api.dto;

import java.math.BigDecimal;

/**
 * Aggregate KPIs for the analytics context (P6.2). No per-employee detail is
 * exposed — only counts and a total of approved spend.
 */
public record ExpenseStatsResponse(
        long submitted,
        long pendingSecondApproval,
        long approved,
        long rejected,
        long cancelled,
        long total,
        BigDecimal approvedAmount,
        String currency) {
}
