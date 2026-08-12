package com.hub.hr.api.dto;

import java.util.List;
import java.util.UUID;

import com.hub.hr.application.OffboardingOutcome;

/** Result of an offboarding (P3.3): identity disabled and downstream fan-out. */
public record OffboardingResponse(
        UUID employeeId,
        UUID keycloakId,
        boolean identityDisabled,
        List<String> notified,
        List<String> failed) {

    public static OffboardingResponse from(OffboardingOutcome outcome) {
        return new OffboardingResponse(
                outcome.employeeId(),
                outcome.keycloakId(),
                outcome.identityDisabled(),
                outcome.notified(),
                outcome.failed());
    }
}
