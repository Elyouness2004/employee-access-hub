package com.hub.hr.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.hub.hr.domain.EmployeeStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

public record EmployeeRequest(
        @NotBlank @Size(max = 32) String matricule,
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotNull @PastOrPresent LocalDate hireDate,
        @NotNull EmployeeStatus status,
        UUID managerId,
        @NotNull UUID departmentId,
        @NotNull UUID positionId) {
}
