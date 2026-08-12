package com.hub.expense.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.hub.expense.domain.ExpenseCategory;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * A new expense claim. {@code currency} is optional — the service defaults it to
 * the deployment currency when omitted (single-currency deployment).
 */
public record CreateExpenseRequest(
        @NotNull ExpenseCategory category,
        @NotNull @Positive @Digits(integer = 10, fraction = 2) BigDecimal amount,
        @Size(min = 3, max = 3) String currency,
        @NotNull @PastOrPresent LocalDate expenseDate,
        @Size(max = 500) String description) {
}
