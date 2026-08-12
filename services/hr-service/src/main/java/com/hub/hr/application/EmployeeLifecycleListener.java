package com.hub.hr.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Runs onboarding / synchronization automatically once the HR write has
 * committed (AFTER_COMMIT): the employee row is guaranteed visible before the
 * identity provider is called, and — crucially — a provider failure here can
 * never roll back the already-committed HR change. Auto-onboarding that fails
 * leaves a FAILED provisioning record for the admin retry endpoint, so the
 * failure is loud and recoverable rather than swallowed.
 */
@Component
public class EmployeeLifecycleListener {

    private static final Logger log = LoggerFactory.getLogger(EmployeeLifecycleListener.class);

    private final ProvisioningService provisioning;
    private final IdentitySyncService sync;

    public EmployeeLifecycleListener(ProvisioningService provisioning, IdentitySyncService sync) {
        this.provisioning = provisioning;
        this.sync = sync;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onProvisioningRequested(EmployeeProvisioningRequested signal) {
        withCorrelation(signal.correlationId(), "auto-onboard employee " + signal.employeeId(),
                () -> provisioning.provision(Actor.system(), signal.employeeId()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSyncRequested(EmployeeSyncRequested signal) {
        withCorrelation(signal.correlationId(), "auto-sync employee " + signal.employeeId(),
                () -> sync.sync(Actor.system(), signal.employeeId()));
    }

    private void withCorrelation(String correlationId, String what, Runnable action) {
        String previous = MDC.get(Correlation.MDC_KEY);
        if (correlationId != null) {
            MDC.put(Correlation.MDC_KEY, correlationId);
        }
        try {
            action.run();
        } catch (RuntimeException e) {
            // the committed HR change must stand; the FAILED history row is the recovery hook
            log.warn("automatic identity lifecycle action failed ({})", what, e);
        } finally {
            if (previous != null) {
                MDC.put(Correlation.MDC_KEY, previous);
            } else {
                MDC.remove(Correlation.MDC_KEY);
            }
        }
    }
}
