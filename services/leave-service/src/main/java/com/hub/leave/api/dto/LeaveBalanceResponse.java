package com.hub.leave.api.dto;

import java.util.UUID;

import com.hub.leave.domain.LeaveBalance;

public record LeaveBalanceResponse(
        UUID id,
        UUID employeeId,
        UUID employeeKeycloakId,
        int year,
        int totalDays,
        int usedDays,
        int availableDays) {

    public static LeaveBalanceResponse from(LeaveBalance balance) {
        return new LeaveBalanceResponse(
                balance.getId(),
                balance.getEmployeeId(),
                balance.getEmployeeKeycloakId(),
                balance.getYear(),
                balance.getTotalDays(),
                balance.getUsedDays(),
                balance.availableDays());
    }
}
