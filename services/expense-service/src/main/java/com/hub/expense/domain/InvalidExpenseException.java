package com.hub.expense.domain;

/** General domain validation failure (no specific BR code) — maps to 422. */
public class InvalidExpenseException extends BusinessRuleViolationException {

    public InvalidExpenseException(String message) {
        super(null, message);
    }
}
