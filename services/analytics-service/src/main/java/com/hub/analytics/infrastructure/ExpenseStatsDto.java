package com.hub.analytics.infrastructure;

import java.math.BigDecimal;

import com.hub.analytics.application.ExpenseSummary;

/** Wire shape of expense-service's ExpenseStatsResponse. */
public record ExpenseStatsDto(
        long submitted,
        long pendingSecondApproval,
        long approved,
        long rejected,
        long cancelled,
        long total,
        BigDecimal approvedAmount,
        String currency) {

    public ExpenseSummary toSummary() {
        return new ExpenseSummary(true, submitted, pendingSecondApproval, approved, rejected,
                cancelled, total, approvedAmount, currency);
    }
}
