package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

/** Result of an offboarding, returned to the API layer. */
public record OffboardingOutcome(UUID employeeId, UUID keycloakId, boolean identityDisabled,
                                 List<String> notified, List<String> failed) {
}
