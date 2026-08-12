package com.hub.leave.infrastructure;

import java.util.UUID;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * hr-service internal API (P2.6), called with the incoming user token relayed
 * (see {@link TokenRelayInterceptor}). Timeouts come from
 * {@code spring.cloud.openfeign.client.config.hr-service}.
 */
@FeignClient(name = "hr-service", url = "${hub.hr.base-url}")
public interface HrEmployeeClient {

    @GetMapping("/internal/employees/{id}")
    HrEmployeeDto byId(@PathVariable("id") UUID id);

    @GetMapping("/internal/employees/by-keycloak/{keycloakId}")
    HrEmployeeDto byKeycloakId(@PathVariable("keycloakId") UUID keycloakId);
}
