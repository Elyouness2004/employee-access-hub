package com.hub.expense.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** BR-02/03/04 and the state machine as pure domain rules. */
class ExpenseTest {

    private static final Money THRESHOLD = Money.of(new BigDecimal("1000.00"), "EUR");
    private static final UUID EMP = UUID.randomUUID();
    private static final UUID EMP_KC = UUID.randomUUID();
    private static final UUID MGR_KC = UUID.randomUUID();

    private Expense claim(String amount) {
        return Expense.submit(EMP, EMP_KC, MGR_KC, ExpenseCategory.TRAVEL,
                Money.of(new BigDecimal(amount), "EUR"), LocalDate.now(), "trip");
    }

    @Test
    void belowThresholdFinishesOnFirstApproval() {
        Expense expense = claim("500.00");
        expense.firstApproval(MGR_KC, "ok", THRESHOLD);
        assertEquals(ExpenseStatus.APPROVED, expense.getStatus());
        assertFalse(expense.isSecondApprovalRequired());
    }

    @Test
    void aboveThresholdRoutesToSecondApprovalBr03() {
        Expense expense = claim("1500.00");
        expense.firstApproval(MGR_KC, "ok", THRESHOLD);
        assertEquals(ExpenseStatus.PENDING_SECOND_APPROVAL, expense.getStatus());
        assertTrue(expense.isSecondApprovalRequired());

        UUID second = UUID.randomUUID();
        expense.secondApproval(second, "signed off");
        assertEquals(ExpenseStatus.APPROVED, expense.getStatus());
        assertEquals(second, expense.getDecidedBy());
    }

    @Test
    void secondApprovalMustDifferFromFirstApprover() {
        Expense expense = claim("1500.00");
        expense.firstApproval(MGR_KC, "ok", THRESHOLD);
        assertThrows(InvalidExpenseException.class, () -> expense.secondApproval(MGR_KC, "again"));
    }

    @Test
    void selfManagedClaimEscalatesBr02() {
        Expense expense = Expense.submit(EMP, EMP_KC, EMP_KC, ExpenseCategory.MEALS,
                Money.of(new BigDecimal("50.00"), "EUR"), LocalDate.now(), "lunch");
        assertTrue(expense.isHrEscalated());
        assertNull(expense.getManagerKeycloakId());
    }

    @Test
    void nobodyDecidesTheirOwnClaimBr02() {
        Expense expense = claim("100.00");
        assertThrows(SelfDecisionException.class, () -> expense.firstApproval(EMP_KC, "self", THRESHOLD));
    }

    @Test
    void rejectedIsTerminalBr04() {
        Expense expense = claim("100.00");
        expense.reject(MGR_KC, "no");
        assertEquals(ExpenseStatus.REJECTED, expense.getStatus());
        assertThrows(IllegalExpenseStateException.class, () -> expense.firstApproval(MGR_KC, "x", THRESHOLD));
        assertThrows(IllegalExpenseStateException.class, expense::cancel);
    }

    @Test
    void cancelOnlyFromSubmitted() {
        Expense expense = claim("100.00");
        expense.firstApproval(MGR_KC, "ok", THRESHOLD);
        assertThrows(IllegalExpenseStateException.class, expense::cancel);
    }

    @Test
    void futureDateIsRejected() {
        assertThrows(InvalidExpenseException.class, () -> Expense.submit(EMP, EMP_KC, MGR_KC,
                ExpenseCategory.TRAVEL, Money.of(new BigDecimal("10.00"), "EUR"),
                LocalDate.now().plusDays(1), "future"));
    }
}
