package com.hub.expense.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.hub.expense.domain.Expense;
import com.hub.expense.domain.ExpenseCategory;
import com.hub.expense.domain.ExpenseStatus;

public record ExpenseResponse(
        UUID id,
        UUID employeeId,
        UUID employeeKeycloakId,
        UUID managerKeycloakId,
        boolean hrEscalated,
        ExpenseCategory category,
        BigDecimal amount,
        String currency,
        LocalDate expenseDate,
        String description,
        ExpenseStatus status,
        boolean secondApprovalRequired,
        UUID firstApproverKeycloakId,
        Instant firstApprovedAt,
        UUID decidedBy,
        Instant decidedAt,
        String decisionComment,
        Instant createdAt,
        Instant updatedAt) {

    public static ExpenseResponse from(Expense expense) {
        return new ExpenseResponse(
                expense.getId(),
                expense.getEmployeeId(),
                expense.getEmployeeKeycloakId(),
                expense.getManagerKeycloakId(),
                expense.isHrEscalated(),
                expense.getCategory(),
                expense.getAmount().amount(),
                expense.getAmount().currency(),
                expense.getExpenseDate(),
                expense.getDescription(),
                expense.getStatus(),
                expense.isSecondApprovalRequired(),
                expense.getFirstApproverKeycloakId(),
                expense.getFirstApprovedAt(),
                expense.getDecidedBy(),
                expense.getDecidedAt(),
                expense.getDecisionComment(),
                expense.getCreatedAt(),
                expense.getUpdatedAt());
    }
}
