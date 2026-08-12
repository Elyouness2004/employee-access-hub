package com.hub.analytics.infrastructure;

import com.hub.analytics.application.LeaveMetricsGateway;
import com.hub.analytics.application.LeaveSummary;

public class RestLeaveMetricsGateway implements LeaveMetricsGateway {

    private final LeaveStatsClient client;
    private final ResilientMetricsSource<LeaveSummary> source;

    public RestLeaveMetricsGateway(LeaveStatsClient client, ResilientMetricsSource<LeaveSummary> source) {
        this.client = client;
        this.source = source;
    }

    @Override
    public LeaveSummary leaveSummary() {
        return source.fetch(() -> client.stats().toSummary());
    }
}
