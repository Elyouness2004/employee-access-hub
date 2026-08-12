package com.hub.leave.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** BR-05 signal payload emitted by hr-service when an employee is disabled. */
public record OffboardingRequest(@NotNull UUID employeeKeycloakId) {
}
