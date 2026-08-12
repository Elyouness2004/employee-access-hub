package com.hub.hr.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;

public record EmployeeResponse(
        UUID id,
        UUID keycloakId,
        String matricule,
        String firstName,
        String lastName,
        String email,
        LocalDate hireDate,
        EmployeeStatus status,
        UUID managerId,
        UUID departmentId,
        UUID positionId,
        Instant createdAt,
        Instant updatedAt) {

    public static EmployeeResponse from(Employee employee) {
        return new EmployeeResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getMatricule(),
                employee.getFirstName(),
                employee.getLastName(),
                employee.getEmail(),
                employee.getHireDate(),
                employee.getStatus(),
                employee.getManagerId(),
                employee.getDepartmentId(),
                employee.getPositionId(),
                employee.getCreatedAt(),
                employee.getUpdatedAt());
    }
}
