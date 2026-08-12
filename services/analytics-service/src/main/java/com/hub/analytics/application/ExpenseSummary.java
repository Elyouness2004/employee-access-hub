package com.hub.analytics.application;

import java.math.BigDecimal;

public record ExpenseSummary(
        boolean available,
        long submitted,
        long pendingSecondApproval,
        long approved,
        long rejected,
        long cancelled,
        long total,
        BigDecimal approvedAmount,
        String currency) {

    public static ExpenseSummary unavailable() {
        return new ExpenseSummary(false, 0, 0, 0, 0, 0, 0, BigDecimal.ZERO, null);
    }
}
