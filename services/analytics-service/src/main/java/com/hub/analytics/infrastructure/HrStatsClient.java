package com.hub.analytics.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/** hr-service internal stats API, called with the caller's token relayed. */
@FeignClient(name = "hr-stats", url = "${hub.sources.hr-url}")
public interface HrStatsClient {

    @GetMapping("/internal/stats")
    HrStatsDto stats();
}
