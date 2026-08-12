package com.hub.hr.config;

import java.time.Duration;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Programmatic Resilience4j registry for the offboarding fan-out (P3.3), mirroring
 * the leave/expense hr-client wiring: one breaker per downstream, built from
 * config so its behavior is explicit and observable.
 */
@Configuration
public class OffboardingClientsConfig {

    @Bean
    CircuitBreakerRegistry offboardingCircuitBreakers(
            @Value("${hub.offboarding.circuit-breaker.sliding-window-size:10}") int slidingWindowSize,
            @Value("${hub.offboarding.circuit-breaker.minimum-number-of-calls:4}") int minimumNumberOfCalls,
            @Value("${hub.offboarding.circuit-breaker.failure-rate-threshold:50}") float failureRateThreshold,
            @Value("${hub.offboarding.circuit-breaker.wait-duration-in-open-state:10s}") Duration waitInOpenState) {
        return CircuitBreakerRegistry.of(CircuitBreakerConfig.custom()
                .slidingWindowSize(slidingWindowSize)
                .minimumNumberOfCalls(minimumNumberOfCalls)
                .failureRateThreshold(failureRateThreshold)
                .waitDurationInOpenState(waitInOpenState)
                .build());
    }
}
