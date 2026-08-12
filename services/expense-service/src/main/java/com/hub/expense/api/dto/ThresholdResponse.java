package com.hub.expense.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.hub.expense.domain.ApprovalThreshold;

public record ThresholdResponse(
        BigDecimal amount,
        String currency,
        String updatedBy,
        Instant updatedAt) {

    public static ThresholdResponse from(ApprovalThreshold threshold) {
        return new ThresholdResponse(
                threshold.getThreshold().amount(),
                threshold.getThreshold().currency(),
                threshold.getUpdatedBy(),
                threshold.getUpdatedAt());
    }
}
