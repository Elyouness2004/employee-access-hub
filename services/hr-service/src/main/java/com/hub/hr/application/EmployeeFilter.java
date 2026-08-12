package com.hub.hr.application;

import java.util.UUID;

import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;

/**
 * Query criteria for the employee directory (HR) and the manager team view
 * (P2.5) — both read the same table through the same
 * {@code EmployeeSpecifications}, so they share one criteria record. Every
 * dimension is optional and ANDs with the others; the free-text {@link #search()}
 * matches matricule, first name, last name or email. Blank inputs are normalised
 * to {@code null} (ignored). Built by the API from request parameters, mirroring
 * {@link AuditFilter}.
 */
public record EmployeeFilter(
        EmployeeStatus status,
        ProvisioningStatus provisioningStatus,
        UUID departmentId,
        UUID positionId,
        UUID managerId,
        String search) {

    public static EmployeeFilter of(EmployeeStatus status, ProvisioningStatus provisioningStatus,
                                    UUID departmentId, UUID positionId, UUID managerId, String search) {
        return new EmployeeFilter(status, provisioningStatus, departmentId, positionId, managerId,
                Filters.blankToNull(search));
    }

    /**
     * The same criteria pinned to one manager's direct reports. Layer-3
     * authorization for the team view: the manager is resolved from the caller's
     * own token, so a client-supplied {@code managerId} can never widen the scope.
     */
    public EmployeeFilter forManager(UUID managerEmployeeId) {
        return new EmployeeFilter(status, provisioningStatus, departmentId, positionId, managerEmployeeId, search);
    }
}
