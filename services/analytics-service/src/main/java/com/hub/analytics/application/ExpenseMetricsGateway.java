package com.hub.analytics.application;

/** Port to expense-service metrics — degrades to {@link ExpenseSummary#unavailable()}. */
public interface ExpenseMetricsGateway {

    ExpenseSummary expenseSummary();
}
