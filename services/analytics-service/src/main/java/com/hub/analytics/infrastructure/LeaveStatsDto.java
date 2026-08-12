package com.hub.analytics.infrastructure;

import com.hub.analytics.application.LeaveSummary;

/** Wire shape of leave-service's LeaveStatsResponse. */
public record LeaveStatsDto(
        long submitted,
        long approved,
        long rejected,
        long cancelled,
        long total) {

    public LeaveSummary toSummary() {
        return new LeaveSummary(true, submitted, approved, rejected, cancelled, total);
    }
}
