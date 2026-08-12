package com.hub.analytics.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/** documents-service internal stats API, called with the caller's token relayed. */
@FeignClient(name = "documents-stats", url = "${hub.sources.documents-url}")
public interface DocumentsStatsClient {

    @GetMapping("/internal/stats")
    DocumentsStatsDto stats();
}
