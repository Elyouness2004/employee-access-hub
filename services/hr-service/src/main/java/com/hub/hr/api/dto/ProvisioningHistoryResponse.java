package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.infrastructure.ProvisioningRecord;

/** One provisioning-history row (Part 5/7). */
public record ProvisioningHistoryResponse(
        UUID id,
        UUID employeeId,
        UUID keycloakId,
        String action,
        String status,
        String detail,
        Instant occurredAt) {

    public static ProvisioningHistoryResponse from(ProvisioningRecord record) {
        return new ProvisioningHistoryResponse(
                record.getId(),
                record.getEmployeeId(),
                record.getKeycloakId(),
                record.getAction(),
                record.getStatus().name(),
                record.getDetail(),
                record.getOccurredAt());
    }
}
