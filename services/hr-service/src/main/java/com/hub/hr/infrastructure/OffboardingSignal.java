package com.hub.hr.infrastructure;

import java.util.UUID;

/** BR-05 signal body posted to the downstream internal offboarding endpoints. */
public record OffboardingSignal(UUID employeeKeycloakId) {
}
