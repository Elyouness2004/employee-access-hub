package com.hub.hr.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/** leave-service BR-05 consumer (P4.6), called with the operator's token relayed. */
@FeignClient(name = "leave-offboarding", url = "${hub.leave.base-url}")
public interface LeaveOffboardingClient {

    @PostMapping("/internal/leave/offboarding")
    void offboard(@RequestBody OffboardingSignal signal);
}
