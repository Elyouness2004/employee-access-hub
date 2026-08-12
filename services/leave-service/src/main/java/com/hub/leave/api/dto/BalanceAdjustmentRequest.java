package com.hub.leave.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** HR adjustment of the annual allocation (FR-22); reason lands in the audit trail. */
public record BalanceAdjustmentRequest(
        @NotNull @Min(0) Integer totalDays,
        @Size(max = 500) String reason) {
}
