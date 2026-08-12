package com.hub.expense.infrastructure;

import java.util.UUID;

import com.hub.expense.domain.EmployeeSnapshot;

/** Wire shape of hr-service's InternalEmployeeResponse. */
public record HrEmployeeDto(
        UUID id,
        UUID keycloakId,
        String status,
        UUID managerId,
        UUID managerKeycloakId) {

    public EmployeeSnapshot toSnapshot() {
        return new EmployeeSnapshot(id, keycloakId, "ACTIVE".equals(status), managerId, managerKeycloakId);
    }
}
