package com.hub.analytics.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/** leave-service internal stats API, called with the caller's token relayed. */
@FeignClient(name = "leave-stats", url = "${hub.sources.leave-url}")
public interface LeaveStatsClient {

    @GetMapping("/internal/stats")
    LeaveStatsDto stats();
}
