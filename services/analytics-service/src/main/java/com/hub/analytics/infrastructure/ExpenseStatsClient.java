package com.hub.analytics.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/** expense-service internal stats API, called with the caller's token relayed. */
@FeignClient(name = "expense-stats", url = "${hub.sources.expense-url}")
public interface ExpenseStatsClient {

    @GetMapping("/internal/stats")
    ExpenseStatsDto stats();
}
