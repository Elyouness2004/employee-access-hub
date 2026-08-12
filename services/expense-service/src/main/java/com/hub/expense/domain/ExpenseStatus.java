package com.hub.expense.domain;

/**
 * Expense state machine. SUBMITTED is the only state an owner cancellation may
 * leave from; a first approval either finishes (below threshold) or routes to
 * PENDING_SECOND_APPROVAL (BR-03). REJECTED and CANCELLED are terminal, so a
 * rejected claim can never be modified again (BR-04).
 */
public enum ExpenseStatus {
    SUBMITTED,
    PENDING_SECOND_APPROVAL,
    APPROVED,
    REJECTED,
    CANCELLED;

    public boolean isTerminal() {
        return this == APPROVED || this == REJECTED || this == CANCELLED;
    }
}
