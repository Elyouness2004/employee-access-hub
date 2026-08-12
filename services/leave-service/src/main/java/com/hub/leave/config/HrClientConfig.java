package com.hub.leave.config;

import java.time.Duration;

import com.hub.leave.infrastructure.HrEmployeeClient;
import com.hub.leave.infrastructure.HrEmployeeDirectory;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Explicit wiring of the hr-service integration: the breaker is built
 * programmatically (no AOP proxying surprises) and shared with tests through
 * the bean, so its state is observable.
 */
@Configuration
public class HrClientConfig {

    @Bean
    CircuitBreaker hrCircuitBreaker(
            @Value("${hub.hr.circuit-breaker.sliding-window-size}") int slidingWindowSize,
            @Value("${hub.hr.circuit-breaker.minimum-number-of-calls}") int minimumNumberOfCalls,
            @Value("${hub.hr.circuit-breaker.failure-rate-threshold}") float failureRateThreshold,
            @Value("${hub.hr.circuit-breaker.wait-duration-in-open-state}") Duration waitDurationInOpenState) {
        return CircuitBreaker.of("hr-service", CircuitBreakerConfig.custom()
                .slidingWindowSize(slidingWindowSize)
                .minimumNumberOfCalls(minimumNumberOfCalls)
                .failureRateThreshold(failureRateThreshold)
                .waitDurationInOpenState(waitDurationInOpenState)
                .build());
    }

    @Bean
    HrEmployeeDirectory employeeDirectory(HrEmployeeClient client,
                                          CircuitBreaker hrCircuitBreaker,
                                          @Value("${hub.hr.snapshot-cache-ttl}") Duration freshTtl,
                                          @Value("${hub.hr.stale-snapshot-ttl}") Duration staleTtl) {
        return new HrEmployeeDirectory(client, hrCircuitBreaker, freshTtl, staleTtl);
    }
}
