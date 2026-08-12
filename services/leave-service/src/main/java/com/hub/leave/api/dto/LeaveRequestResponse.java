package com.hub.leave.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.hub.leave.domain.LeaveRequest;
import com.hub.leave.domain.LeaveStatus;
import com.hub.leave.domain.LeaveType;

public record LeaveRequestResponse(
        UUID id,
        UUID employeeId,
        UUID employeeKeycloakId,
        UUID managerKeycloakId,
        boolean hrEscalated,
        LeaveType type,
        LocalDate startDate,
        LocalDate endDate,
        int businessDays,
        String reason,
        LeaveStatus status,
        UUID decidedBy,
        Instant decidedAt,
        String decisionComment,
        Instant createdAt,
        Instant updatedAt) {

    public static LeaveRequestResponse from(LeaveRequest request) {
        return new LeaveRequestResponse(
                request.getId(),
                request.getEmployeeId(),
                request.getEmployeeKeycloakId(),
                request.getManagerKeycloakId(),
                request.isHrEscalated(),
                request.getType(),
                request.getPeriod().getStart(),
                request.getPeriod().getEnd(),
                request.getBusinessDays(),
                request.getReason(),
                request.getStatus(),
                request.getDecidedBy(),
                request.getDecidedAt(),
                request.getDecisionComment(),
                request.getCreatedAt(),
                request.getUpdatedAt());
    }
}
