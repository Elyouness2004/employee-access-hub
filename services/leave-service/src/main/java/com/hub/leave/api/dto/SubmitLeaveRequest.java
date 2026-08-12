package com.hub.leave.api.dto;

import java.time.LocalDate;

import com.hub.leave.domain.LeaveType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SubmitLeaveRequest(
        @NotNull LeaveType type,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @Size(max = 500) String reason) {
}
