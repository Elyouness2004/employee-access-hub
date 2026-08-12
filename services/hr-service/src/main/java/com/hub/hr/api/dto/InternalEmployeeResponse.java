package com.hub.hr.api.dto;

import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;

/**
 * Minimal projection for token-relay consumers (leave/expense): identity link,
 * activity status and the manager relationship — nothing more (§2.5).
 */
public record InternalEmployeeResponse(
        UUID id,
        UUID keycloakId,
        EmployeeStatus status,
        UUID managerId,
        UUID managerKeycloakId) {

    public static InternalEmployeeResponse from(Employee employee, Employee manager) {
        return new InternalEmployeeResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getStatus(),
                employee.getManagerId(),
                manager == null ? null : manager.getKeycloakId());
    }
}
