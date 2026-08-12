package com.hub.hr.infrastructure;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.hub.hr.application.OffboardingNotifier;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Offboarding fan-out over OpenFeign with a per-downstream Resilience4j breaker
 * (P3.3). Each notification is best-effort and isolated: a single downstream
 * outage is recorded in {@code failed} and the others still run — offboarding
 * must not be held hostage by one service, and the emitted event backs later
 * reconciliation.
 */
@Component
public class FeignOffboardingNotifier implements OffboardingNotifier {

    private static final Logger log = LoggerFactory.getLogger(FeignOffboardingNotifier.class);

    private final LeaveOffboardingClient leave;
    private final ExpenseOffboardingClient expense;
    private final DocumentsOffboardingClient documents;
    private final CircuitBreakerRegistry breakers;

    public FeignOffboardingNotifier(LeaveOffboardingClient leave,
                                    ExpenseOffboardingClient expense,
                                    DocumentsOffboardingClient documents,
                                    CircuitBreakerRegistry breakers) {
        this.leave = leave;
        this.expense = expense;
        this.documents = documents;
        this.breakers = breakers;
    }

    @Override
    public OffboardingFanout notifyDownstream(UUID employeeKeycloakId) {
        OffboardingSignal signal = new OffboardingSignal(employeeKeycloakId);
        List<String> notified = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        notify("leave", () -> leave.offboard(signal), notified, failed);
        notify("expense", () -> expense.offboard(signal), notified, failed);
        notify("documents", () -> documents.offboard(signal), notified, failed);
        return new OffboardingFanout(notified, failed);
    }

    private void notify(String service, Runnable call, List<String> notified, List<String> failed) {
        try {
            breakers.circuitBreaker("offboarding-" + service).executeRunnable(call);
            notified.add(service);
        } catch (RuntimeException e) {
            failed.add(service);
            log.warn("offboarding notification to {} failed: {}", service, e.toString());
        }
    }
}
