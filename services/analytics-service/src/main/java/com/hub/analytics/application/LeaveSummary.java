package com.hub.analytics.application;

public record LeaveSummary(
        boolean available,
        long submitted,
        long approved,
        long rejected,
        long cancelled,
        long total) {

    public static LeaveSummary unavailable() {
        return new LeaveSummary(false, 0, 0, 0, 0, 0);
    }
}
