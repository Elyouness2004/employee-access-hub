package com.hub.expense.domain;

/** An operation mixed two currencies (e.g. claim vs. threshold) — maps to 422. */
public class CurrencyMismatchException extends BusinessRuleViolationException {

    public CurrencyMismatchException(String expected, String actual) {
        super(null, "currency " + actual + " does not match the expected " + expected);
    }
}
