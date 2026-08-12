package com.hub.expense.application;

/** The caller has no active employee record to file an expense against — 422. */
public class EmployeeNotEligibleException extends RuntimeException {

    public EmployeeNotEligibleException(String message) {
        super(message);
    }
}
