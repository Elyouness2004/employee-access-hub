package com.hub.analytics.infrastructure;

import com.hub.analytics.application.EmployeeSummary;
import com.hub.analytics.application.HrMetricsGateway;

public class RestHrMetricsGateway implements HrMetricsGateway {

    private final HrStatsClient client;
    private final ResilientMetricsSource<EmployeeSummary> source;

    public RestHrMetricsGateway(HrStatsClient client, ResilientMetricsSource<EmployeeSummary> source) {
        this.client = client;
        this.source = source;
    }

    @Override
    public EmployeeSummary employeeSummary() {
        return source.fetch(() -> client.stats().toSummary());
    }
}
