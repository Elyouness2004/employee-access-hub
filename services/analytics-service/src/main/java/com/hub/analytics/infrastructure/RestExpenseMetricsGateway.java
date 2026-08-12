package com.hub.analytics.infrastructure;

import com.hub.analytics.application.ExpenseMetricsGateway;
import com.hub.analytics.application.ExpenseSummary;

public class RestExpenseMetricsGateway implements ExpenseMetricsGateway {

    private final ExpenseStatsClient client;
    private final ResilientMetricsSource<ExpenseSummary> source;

    public RestExpenseMetricsGateway(ExpenseStatsClient client, ResilientMetricsSource<ExpenseSummary> source) {
        this.client = client;
        this.source = source;
    }

    @Override
    public ExpenseSummary expenseSummary() {
        return source.fetch(() -> client.stats().toSummary());
    }
}
