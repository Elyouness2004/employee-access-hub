package com.hub.leave.infrastructure;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hub.leave.domain.EmployeeDirectory;
import com.hub.leave.domain.EmployeeSnapshot;
import com.hub.leave.domain.HrDirectoryUnavailableException;
import feign.FeignException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;

/**
 * EmployeeDirectory adapter: OpenFeign call wrapped in a Resilience4j circuit
 * breaker with a two-tier Caffeine cache.
 *
 * Staleness trade-off (§2.5, documented): a fresh snapshot short-circuits HR
 * for its TTL, so a manager change propagates to NEW submissions within that
 * window (existing requests keep their snapshot by design). The longer-lived
 * stale tier is read ONLY when HR is unreachable — degraded service beats a
 * cascading outage. With both tiers cold and HR down the lookup fails fast
 * with {@link HrDirectoryUnavailableException} (503 at the API).
 */
public class HrEmployeeDirectory implements EmployeeDirectory {

    private final HrEmployeeClient client;
    private final CircuitBreaker circuitBreaker;
    private final Cache<String, EmployeeSnapshot> fresh;
    private final Cache<String, EmployeeSnapshot> stale;

    public HrEmployeeDirectory(HrEmployeeClient client, CircuitBreaker circuitBreaker,
                               Duration freshTtl, Duration staleTtl) {
        this.client = client;
        this.circuitBreaker = circuitBreaker;
        this.fresh = Caffeine.newBuilder().expireAfterWrite(freshTtl).maximumSize(10_000).build();
        this.stale = Caffeine.newBuilder().expireAfterWrite(staleTtl).maximumSize(10_000).build();
    }

    @Override
    public Optional<EmployeeSnapshot> findByKeycloakId(UUID keycloakId) {
        return lookup("kc:" + keycloakId, () -> client.byKeycloakId(keycloakId));
    }

    @Override
    public Optional<EmployeeSnapshot> findById(UUID employeeId) {
        return lookup("id:" + employeeId, () -> client.byId(employeeId));
    }

    private Optional<EmployeeSnapshot> lookup(String key, Supplier<HrEmployeeDto> call) {
        EmployeeSnapshot cached = fresh.getIfPresent(key);
        if (cached != null) {
            return Optional.of(cached);
        }
        try {
            // a 404 is an answer, not a failure: it must not trip the breaker
            HrEmployeeDto dto = circuitBreaker.executeSupplier(() -> {
                try {
                    return call.get();
                } catch (FeignException.NotFound e) {
                    return null;
                }
            });
            if (dto == null) {
                return Optional.empty();
            }
            EmployeeSnapshot snapshot = dto.toSnapshot();
            fresh.put(key, snapshot);
            stale.put(key, snapshot);
            return Optional.of(snapshot);
        } catch (Exception e) {
            EmployeeSnapshot lastKnownGood = stale.getIfPresent(key);
            if (lastKnownGood != null) {
                return Optional.of(lastKnownGood);
            }
            throw new HrDirectoryUnavailableException(e);
        }
    }
}
