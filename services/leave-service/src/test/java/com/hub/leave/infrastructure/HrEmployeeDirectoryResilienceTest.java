package com.hub.leave.infrastructure;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import com.hub.leave.domain.EmployeeSnapshot;
import com.hub.leave.domain.HrDirectoryUnavailableException;
import feign.FeignException;
import feign.Request;
import feign.RequestTemplate;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * P4.9 resilience: hr-service outage must degrade gracefully, not cascade.
 * Proves the two-tier cache + circuit breaker behaviour of
 * {@link HrEmployeeDirectory} directly, without a running HR.
 */
class HrEmployeeDirectoryResilienceTest {

    private static final UUID EMPLOYEE_ID = UUID.randomUUID();
    private static final UUID EMPLOYEE_KC = UUID.randomUUID();
    private static final UUID MANAGER_ID = UUID.randomUUID();
    private static final UUID MANAGER_KC = UUID.randomUUID();

    private HrEmployeeClient client;
    private CircuitBreaker circuitBreaker;
    private HrEmployeeDirectory directory;

    private static HrEmployeeDto dto() {
        return new HrEmployeeDto(EMPLOYEE_ID, EMPLOYEE_KC, "ACTIVE", MANAGER_ID, MANAGER_KC);
    }

    private static FeignException serviceDown() {
        Request request = Request.create(Request.HttpMethod.GET, "/internal/employees/x",
                java.util.Map.of(), null, new RequestTemplate());
        return new FeignException.ServiceUnavailable("hr down", request, null, null);
    }

    @BeforeEach
    void setUp() {
        client = mock(HrEmployeeClient.class);
        circuitBreaker = CircuitBreaker.of("test", CircuitBreakerConfig.custom()
                .slidingWindowSize(4)
                .minimumNumberOfCalls(2)
                .failureRateThreshold(50)
                .waitDurationInOpenState(Duration.ofSeconds(10))
                .build());
        directory = new HrEmployeeDirectory(client, circuitBreaker, Duration.ofMinutes(10), Duration.ofHours(24));
    }

    @Test
    void freshCacheServesWithoutCallingHrAgain() {
        given(client.byKeycloakId(EMPLOYEE_KC)).willReturn(dto());

        directory.findByKeycloakId(EMPLOYEE_KC);
        directory.findByKeycloakId(EMPLOYEE_KC);
        directory.findByKeycloakId(EMPLOYEE_KC);

        // one network call; the rest come from the fresh tier
        verify(client, times(1)).byKeycloakId(EMPLOYEE_KC);
    }

    @Test
    void staleSnapshotIsServedWhileHrIsDown() {
        given(client.byKeycloakId(EMPLOYEE_KC)).willReturn(dto());
        Optional<EmployeeSnapshot> primed = directory.findByKeycloakId(EMPLOYEE_KC);
        assertThat(primed).isPresent();

        // let the fresh tier expire; HR then goes down
        HrEmployeeDirectory shortFresh = new HrEmployeeDirectory(
                client, circuitBreaker, Duration.ZERO, Duration.ofHours(24));
        given(client.byKeycloakId(EMPLOYEE_KC)).willReturn(dto());
        shortFresh.findByKeycloakId(EMPLOYEE_KC);          // primes the stale tier
        reset(client);
        given(client.byKeycloakId(EMPLOYEE_KC)).willThrow(serviceDown());

        Optional<EmployeeSnapshot> served = shortFresh.findByKeycloakId(EMPLOYEE_KC);
        assertThat(served).isPresent();
        assertThat(served.get().managerKeycloakId()).isEqualTo(MANAGER_KC);
    }

    @Test
    void coldCacheWithHrDownFailsFastWithoutCascading() {
        given(client.byKeycloakId(EMPLOYEE_KC)).willThrow(serviceDown());

        assertThatThrownBy(() -> directory.findByKeycloakId(EMPLOYEE_KC))
                .isInstanceOf(HrDirectoryUnavailableException.class);
    }

    @Test
    void breakerOpensAfterRepeatedFailuresAndStopsCallingHr() {
        given(client.byKeycloakId(EMPLOYEE_KC)).willThrow(serviceDown());

        for (int i = 0; i < 6; i++) {
            try {
                directory.findByKeycloakId(EMPLOYEE_KC);
            } catch (HrDirectoryUnavailableException expected) {
                // degraded, not cascaded
            }
        }

        // once OPEN, calls short-circuit: HR is not hammered during an outage
        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.OPEN);
    }

    @Test
    void notFoundIsAnAnswerNotAFailureAndDoesNotTripBreaker() {
        Request request = Request.create(Request.HttpMethod.GET, "/internal/employees/x",
                java.util.Map.of(), null, new RequestTemplate());
        given(client.byKeycloakId(EMPLOYEE_KC))
                .willThrow(new FeignException.NotFound("missing", request, null, null));

        for (int i = 0; i < 5; i++) {
            assertThat(directory.findByKeycloakId(EMPLOYEE_KC)).isEmpty();
        }
        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }
}
