package com.hub.hr.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.hub.hr.domain.Department;
import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.Position;
import com.hub.hr.domain.ProvisioningStatus;

/**
 * Self-service projection of an employee record (P2.4 own profile, P2.5 team
 * view). It carries the same fields as {@link EmployeeResponse} plus the
 * resolved department, position and manager labels, because the callers of these
 * two endpoints — an employee or a manager — cannot read the
 * {@code /api/hr/departments} and {@code /api/hr/positions} catalogues (HR/Admin
 * only) and so could never turn the raw ids into anything displayable.
 *
 * <p>Nothing here is new data: every field already exists on the aggregate. The
 * HR directory keeps returning the id-only {@link EmployeeResponse}, since HR
 * does have the catalogues.
 */
public record EmployeeProfileResponse(
        UUID id,
        UUID keycloakId,
        String matricule,
        String firstName,
        String lastName,
        String email,
        LocalDate hireDate,
        EmployeeStatus status,
        ProvisioningStatus provisioningStatus,
        UUID departmentId,
        String departmentName,
        UUID positionId,
        String positionTitle,
        UUID managerId,
        UUID managerKeycloakId,
        String managerName,
        String managerEmail,
        Instant createdAt,
        Instant updatedAt) {

    /** Any of {@code department}, {@code position} or {@code manager} may be null (unresolved / no manager). */
    public static EmployeeProfileResponse from(Employee employee, Department department,
                                               Position position, Employee manager) {
        return new EmployeeProfileResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getMatricule(),
                employee.getFirstName(),
                employee.getLastName(),
                employee.getEmail(),
                employee.getHireDate(),
                employee.getStatus(),
                employee.getProvisioningStatus(),
                employee.getDepartmentId(),
                department == null ? null : department.getName(),
                employee.getPositionId(),
                position == null ? null : position.getTitle(),
                employee.getManagerId(),
                manager == null ? null : manager.getKeycloakId(),
                manager == null ? null : manager.getFirstName() + " " + manager.getLastName(),
                manager == null ? null : manager.getEmail(),
                employee.getCreatedAt(),
                employee.getUpdatedAt());
    }
}
