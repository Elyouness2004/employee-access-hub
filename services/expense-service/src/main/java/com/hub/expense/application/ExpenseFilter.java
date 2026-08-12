package com.hub.expense.application;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.hub.expense.domain.ExpenseCategory;
import com.hub.expense.domain.ExpenseStatus;

/**
 * Query criteria shared by every claim list (own claims, manager inbox, HR
 * escalations, second-approval queue, HR search). Each list pins its own scope —
 * the owner, the addressed manager, the escalation flag, the status — and these
 * criteria only narrow within it, so no filter can ever widen what a caller
 * sees. Blank inputs are normalised to {@code null} (ignored).
 *
 * <p>{@code minAmount}/{@code maxAmount} compare the numeric amount only: the
 * currency is a separate dimension and mixing them is precisely what BR-03
 * refuses to do.
 */
public record ExpenseFilter(
        ExpenseStatus status,
        ExpenseCategory category,
        LocalDate from,
        LocalDate to,
        BigDecimal minAmount,
        BigDecimal maxAmount,
        String search) {

    public static ExpenseFilter of(ExpenseStatus status, ExpenseCategory category,
                                   LocalDate from, LocalDate to,
                                   BigDecimal minAmount, BigDecimal maxAmount, String search) {
        return new ExpenseFilter(status, category, from, to, minAmount, maxAmount, blankToNull(search));
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
