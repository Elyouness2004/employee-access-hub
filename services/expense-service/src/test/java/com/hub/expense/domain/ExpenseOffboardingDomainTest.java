package com.hub.expense.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ExpenseOffboardingDomainTest {

    private Expense submitted() {
        return Expense.submit(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                ExpenseCategory.TRAVEL, Money.of(new BigDecimal("50.00"), "EUR"),
                LocalDate.now().minusDays(1), "taxi");
    }

    @Test
    void cancelsAStillOpenClaim() {
        Expense expense = submitted();
        assertThat(expense.cancelForOffboarding()).isTrue();
        assertThat(expense.getStatus()).isEqualTo(ExpenseStatus.CANCELLED);
    }

    @Test
    void aDecidedOrCancelledClaimStaysImmutable() {
        Expense expense = submitted();
        expense.cancelForOffboarding();
        // already cancelled → nothing more to cancel, history preserved
        assertThat(expense.cancelForOffboarding()).isFalse();
        assertThat(expense.getStatus()).isEqualTo(ExpenseStatus.CANCELLED);
    }

    @Test
    void cancelsAClaimAwaitingSecondLevelApproval() {
        UUID employeeKc = UUID.randomUUID();
        UUID managerKc = UUID.randomUUID();
        Expense expense = Expense.submit(UUID.randomUUID(), employeeKc, managerKc,
                ExpenseCategory.TRAVEL, Money.of(new BigDecimal("2000.00"), "EUR"),
                LocalDate.now().minusDays(1), "conference");
        expense.firstApproval(managerKc, "ok", Money.of(new BigDecimal("1000.00"), "EUR"));
        assertThat(expense.getStatus()).isEqualTo(ExpenseStatus.PENDING_SECOND_APPROVAL);

        assertThat(expense.cancelForOffboarding()).isTrue();
        assertThat(expense.getStatus()).isEqualTo(ExpenseStatus.CANCELLED);
    }
}
