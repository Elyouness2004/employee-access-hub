package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

/**
 * Port for the offboarding fan-out (P3.3). The adapter calls the leave, expense
 * and documents internal APIs over OpenFeign with the operator's token relayed
 * and a Resilience4j breaker; each call is best-effort so a single downstream
 * outage cannot abort the offboarding (eventual consistency, the event trail
 * backs reconciliation). Behind a port so tests inject a recording fake.
 */
public interface OffboardingNotifier {

    OffboardingFanout notifyDownstream(UUID employeeKeycloakId);

    record OffboardingFanout(List<String> notified, List<String> failed) {
    }
}
