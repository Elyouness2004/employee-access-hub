package com.hub.hr.infrastructure;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/** expense-service BR-05 consumer, called with the operator's token relayed. */
@FeignClient(name = "expense-offboarding", url = "${hub.expense.base-url}")
public interface ExpenseOffboardingClient {

    @PostMapping("/internal/expense/offboarding")
    void offboard(@RequestBody OffboardingSignal signal);
}
