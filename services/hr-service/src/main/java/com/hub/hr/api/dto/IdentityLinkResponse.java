package com.hub.hr.api.dto;

import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;

/** Employee↔Keycloak identity link for the internal users API (Part 5). */
public record IdentityLinkResponse(
        UUID employeeId,
        UUID keycloakId,
        String matricule,
        String email,
        EmployeeStatus employeeStatus,
        ProvisioningStatus provisioningStatus) {

    public static IdentityLinkResponse from(Employee employee) {
        return new IdentityLinkResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getMatricule(),
                employee.getEmail(),
                employee.getStatus(),
                employee.getProvisioningStatus());
    }
}
