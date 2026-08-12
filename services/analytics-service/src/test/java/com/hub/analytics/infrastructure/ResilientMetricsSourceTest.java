package com.hub.analytics.infrastructure;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The circuit-breaker + two-tier snapshot cache behaviour (P6.3). */
class ResilientMetricsSourceTest {

    @Test
    void freshSnapshotShortCircuitsTheSource() {
        ResilientMetricsSource<String> source = new ResilientMetricsSource<>(
                CircuitBreaker.ofDefaults("t1"), Duration.ofMinutes(1), Duration.ofHours(1), "UNAVAILABLE");
        AtomicInteger calls = new AtomicInteger();

        assertEquals("v1", source.fetch(() -> "v" + calls.incrementAndGet()));
        // second call within the fresh TTL must not hit the source again
        assertEquals("v1", source.fetch(() -> "v" + calls.incrementAndGet()));
        assertEquals(1, calls.get());
    }

    @Test
    void staleSnapshotIsServedWhileSourceIsDown() {
        // freshTtl ZERO: the response cache never short-circuits, so every call
        // exercises the source — letting us drive it up then down deterministically
        ResilientMetricsSource<String> source = new ResilientMetricsSource<>(
                CircuitBreaker.ofDefaults("t2"), Duration.ZERO, Duration.ofHours(1), "UNAVAILABLE");

        assertEquals("good", source.fetch(() -> "good"));
        // source now throws — the last-known-good stale snapshot is served, no error
        assertEquals("good", source.fetch(() -> {
            throw new RuntimeException("source down");
        }));
    }

    @Test
    void unavailableWhenNothingCachedAndSourceDown() {
        ResilientMetricsSource<String> source = new ResilientMetricsSource<>(
                CircuitBreaker.ofDefaults("t3"), Duration.ZERO, Duration.ofHours(1), "UNAVAILABLE");

        assertEquals("UNAVAILABLE", source.fetch(() -> {
            throw new RuntimeException("source down");
        }));
    }
}
