package com.hub.leave.domain;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BR-01 lives in debit(); adjustment/credit invariants around it. */
class LeaveBalanceTest {

    private LeaveBalance balance(int total) {
        return LeaveBalance.provision(UUID.randomUUID(), UUID.randomUUID(), 2026, total);
    }

    @Test
    void debitWithinBalanceConsumesDays() {
        LeaveBalance balance = balance(25);
        balance.debit(5);
        assertThat(balance.getUsedDays()).isEqualTo(5);
        assertThat(balance.availableDays()).isEqualTo(20);
    }

    @Test
    void debitBeyondBalanceViolatesBr01() {
        LeaveBalance balance = balance(3);
        assertThatThrownBy(() -> balance.debit(4))
                .isInstanceOf(InsufficientBalanceException.class)
                .extracting(e -> ((BusinessRuleViolationException) e).getRule()).isEqualTo("BR-01");
        assertThat(balance.getUsedDays()).isZero();
    }

    @Test
    void exactRemainingBalanceIsAllowed() {
        LeaveBalance balance = balance(5);
        balance.debit(5);
        assertThat(balance.availableDays()).isZero();
        assertThatThrownBy(() -> balance.debit(1)).isInstanceOf(InsufficientBalanceException.class);
    }

    @Test
    void creditRestoresDaysAndFloorsAtZero() {
        LeaveBalance balance = balance(25);
        balance.debit(5);
        balance.credit(3);
        assertThat(balance.getUsedDays()).isEqualTo(2);
        balance.credit(10);
        assertThat(balance.getUsedDays()).isZero();
    }

    @Test
    void adjustTotalRespectsDaysAlreadyUsed() {
        LeaveBalance balance = balance(25);
        balance.debit(10);

        balance.adjustTotal(12);
        assertThat(balance.availableDays()).isEqualTo(2);

        assertThatThrownBy(() -> balance.adjustTotal(9))
                .isInstanceOf(InvalidBalanceAdjustmentException.class);
        assertThatThrownBy(() -> balance.adjustTotal(-1))
                .isInstanceOf(InvalidBalanceAdjustmentException.class);
    }

    @Test
    void negativeProvisionIsRejected() {
        assertThatThrownBy(() -> balance(-1)).isInstanceOf(InvalidBalanceAdjustmentException.class);
    }
}
