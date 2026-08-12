package com.hub.leave.infrastructure;

import java.util.UUID;

import com.hub.leave.domain.EmployeeSnapshot;

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
