package com.hub.leave.domain;

/** Only ANNUAL leave draws on the tracked balance (BR-01). */
public enum LeaveType {
    ANNUAL(true),
    SICK(false),
    UNPAID(false);

    private final boolean balanceTracked;

    LeaveType(boolean balanceTracked) {
        this.balanceTracked = balanceTracked;
    }

    public boolean isBalanceTracked() {
        return balanceTracked;
    }
}
