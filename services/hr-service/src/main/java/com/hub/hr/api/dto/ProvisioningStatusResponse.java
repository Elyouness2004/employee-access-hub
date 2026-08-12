package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;

/**
 * Identity state of an employee: the EMPLOYMENT status and the ACCOUNT state,
 * kept as two separate fields because they answer different questions and
 * routinely disagree. {@code employeeStatus} is the HR record (ACTIVE / DISABLED
 * / TERMINATED); {@code provisioningStatus} is what Keycloak holds
 * (NOT_PROVISIONED / PROVISIONED / FAILED / DISABLED / LOCKED). A locked account
 * belongs to an ACTIVE employee; a TERMINATED employee still has a DISABLED
 * account on record. Anything that renders one as if it were the other is wrong.
 *
 * <p>{@code activationEmailSent} is the outcome of the action just performed —
 * whether the employee actually received the Keycloak password-setup link —
 * and is {@code null} for a plain read or an action that sends no mail. It is
 * never a password: none is generated, so none can be returned.
 */
public record ProvisioningStatusResponse(
        UUID employeeId,
        UUID keycloakId,
        boolean linked,
        EmployeeStatus employeeStatus,
        ProvisioningStatus provisioningStatus,
        String realmRole,
        Instant provisionedAt,
        Instant lastSyncAt,
        Boolean activationEmailSent) {

    public static ProvisioningStatusResponse from(Employee employee, String realmRole) {
        return from(employee, realmRole, null);
    }

    public static ProvisioningStatusResponse from(Employee employee, String realmRole,
                                                  Boolean activationEmailSent) {
        return new ProvisioningStatusResponse(
                employee.getId(),
                employee.getKeycloakId(),
                employee.getKeycloakId() != null,
                employee.getStatus(),
                employee.getProvisioningStatus(),
                realmRole,
                employee.getProvisionedAt(),
                employee.getLastSyncAt(),
                activationEmailSent);
    }
}
