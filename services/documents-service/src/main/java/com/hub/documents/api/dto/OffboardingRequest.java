package com.hub.documents.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** Offboarding signal emitted by hr-service when an employee is offboarded. */
public record OffboardingRequest(@NotNull UUID employeeKeycloakId) {
}
