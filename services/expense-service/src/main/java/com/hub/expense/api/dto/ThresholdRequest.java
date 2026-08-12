package com.hub.expense.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** HR/Admin change to the BR-03 second-level approval threshold. */
public record ThresholdRequest(
        @NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2) BigDecimal amount,
        @Size(min = 3, max = 3) String currency) {
}
