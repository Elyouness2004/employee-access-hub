package com.hub.analytics.infrastructure;

import java.time.Duration;
import java.util.function.Supplier;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;

/**
 * One downstream metrics source wrapped in the same resilience story the leave
 * context uses (§2.5): a Resilience4j circuit breaker plus a two-tier Caffeine
 * cache. A fresh snapshot short-circuits the source for its TTL (the response
 * cache); the longer-lived stale tier is served ONLY when the source is
 * unreachable. With both tiers cold and the source down, the caller-supplied
 * {@code unavailable} value is returned — analytics degrades, never cascades.
 *
 * @param <T> the summary type; must carry its own "available" flag
 */
public class ResilientMetricsSource<T> {

    private static final String KEY = "snapshot";

    private final CircuitBreaker circuitBreaker;
    private final Cache<String, T> fresh;
    private final Cache<String, T> stale;
    private final T unavailable;

    public ResilientMetricsSource(CircuitBreaker circuitBreaker, Duration freshTtl, Duration staleTtl,
                                  T unavailable) {
        this.circuitBreaker = circuitBreaker;
        this.fresh = Caffeine.newBuilder().expireAfterWrite(freshTtl).maximumSize(16).build();
        this.stale = Caffeine.newBuilder().expireAfterWrite(staleTtl).maximumSize(16).build();
        this.unavailable = unavailable;
    }

    public T fetch(Supplier<T> call) {
        T cached = fresh.getIfPresent(KEY);
        if (cached != null) {
            return cached;
        }
        try {
            T value = circuitBreaker.executeSupplier(call::get);
            fresh.put(KEY, value);
            stale.put(KEY, value);
            return value;
        } catch (Exception e) {
            T lastKnownGood = stale.getIfPresent(KEY);
            return lastKnownGood != null ? lastKnownGood : unavailable;
        }
    }
}
