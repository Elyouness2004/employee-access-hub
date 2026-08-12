package com.hub.analytics.config;

import java.time.Duration;

import com.hub.analytics.application.DocumentsMetricsGateway;
import com.hub.analytics.application.DocumentsSummary;
import com.hub.analytics.application.EmployeeSummary;
import com.hub.analytics.application.ExpenseMetricsGateway;
import com.hub.analytics.application.ExpenseSummary;
import com.hub.analytics.application.HrMetricsGateway;
import com.hub.analytics.application.LeaveMetricsGateway;
import com.hub.analytics.application.LeaveSummary;
import com.hub.analytics.infrastructure.DocumentsStatsClient;
import com.hub.analytics.infrastructure.ExpenseStatsClient;
import com.hub.analytics.infrastructure.HrStatsClient;
import com.hub.analytics.infrastructure.LeaveStatsClient;
import com.hub.analytics.infrastructure.ResilientMetricsSource;
import com.hub.analytics.infrastructure.RestDocumentsMetricsGateway;
import com.hub.analytics.infrastructure.RestExpenseMetricsGateway;
import com.hub.analytics.infrastructure.RestHrMetricsGateway;
import com.hub.analytics.infrastructure.RestLeaveMetricsGateway;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Explicit wiring of the four downstream metrics sources: each gets its own
 * Resilience4j circuit breaker (built programmatically, no AOP surprises) and a
 * two-tier snapshot cache, so one source's outage can never trip another's
 * breaker or fail the whole dashboard (P6.3).
 */
@Configuration
public class MetricsSourcesConfig {

    private final int slidingWindowSize;
    private final int minimumNumberOfCalls;
    private final float failureRateThreshold;
    private final Duration waitDurationInOpenState;
    private final Duration freshTtl;
    private final Duration staleTtl;

    public MetricsSourcesConfig(
            @Value("${hub.sources.circuit-breaker.sliding-window-size}") int slidingWindowSize,
            @Value("${hub.sources.circuit-breaker.minimum-number-of-calls}") int minimumNumberOfCalls,
            @Value("${hub.sources.circuit-breaker.failure-rate-threshold}") float failureRateThreshold,
            @Value("${hub.sources.circuit-breaker.wait-duration-in-open-state}") Duration waitDurationInOpenState,
            @Value("${hub.sources.snapshot-cache-ttl}") Duration freshTtl,
            @Value("${hub.sources.stale-snapshot-ttl}") Duration staleTtl) {
        this.slidingWindowSize = slidingWindowSize;
        this.minimumNumberOfCalls = minimumNumberOfCalls;
        this.failureRateThreshold = failureRateThreshold;
        this.waitDurationInOpenState = waitDurationInOpenState;
        this.freshTtl = freshTtl;
        this.staleTtl = staleTtl;
    }

    private CircuitBreaker breaker(String name) {
        return CircuitBreaker.of(name, CircuitBreakerConfig.custom()
                .slidingWindowSize(slidingWindowSize)
                .minimumNumberOfCalls(minimumNumberOfCalls)
                .failureRateThreshold(failureRateThreshold)
                .waitDurationInOpenState(waitDurationInOpenState)
                .build());
    }

    @Bean
    HrMetricsGateway hrMetricsGateway(HrStatsClient client) {
        return new RestHrMetricsGateway(client, new ResilientMetricsSource<>(
                breaker("hr-stats"), freshTtl, staleTtl, EmployeeSummary.unavailable()));
    }

    @Bean
    LeaveMetricsGateway leaveMetricsGateway(LeaveStatsClient client) {
        return new RestLeaveMetricsGateway(client, new ResilientMetricsSource<>(
                breaker("leave-stats"), freshTtl, staleTtl, LeaveSummary.unavailable()));
    }

    @Bean
    ExpenseMetricsGateway expenseMetricsGateway(ExpenseStatsClient client) {
        return new RestExpenseMetricsGateway(client, new ResilientMetricsSource<>(
                breaker("expense-stats"), freshTtl, staleTtl, ExpenseSummary.unavailable()));
    }

    @Bean
    DocumentsMetricsGateway documentsMetricsGateway(DocumentsStatsClient client) {
        return new RestDocumentsMetricsGateway(client, new ResilientMetricsSource<>(
                breaker("documents-stats"), freshTtl, staleTtl, DocumentsSummary.unavailable()));
    }
}
