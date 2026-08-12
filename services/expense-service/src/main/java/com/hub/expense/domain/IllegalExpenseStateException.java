package com.hub.expense.domain;

/**
 * Transition not allowed by the state machine — maps to 409. Also the
 * enforcement point for BR-04: a REJECTED (or otherwise terminal) claim cannot
 * be modified, so any decision or cancellation attempt on it lands here.
 */
public class IllegalExpenseStateException extends RuntimeException {

    public IllegalExpenseStateException(ExpenseStatus current, String attempted) {
        super("cannot " + attempted + " an expense in status " + current);
    }
}
