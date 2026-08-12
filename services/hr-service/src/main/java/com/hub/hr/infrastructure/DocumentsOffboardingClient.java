package com.hub.hr.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/** documents-service offboarding consumer, called with the operator's token relayed. */
@FeignClient(name = "documents-offboarding", url = "${hub.documents.base-url}")
public interface DocumentsOffboardingClient {

    @PostMapping("/internal/documents/offboarding")
    void offboard(@RequestBody OffboardingSignal signal);
}
