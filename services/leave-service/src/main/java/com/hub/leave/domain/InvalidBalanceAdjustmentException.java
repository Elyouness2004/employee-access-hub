package com.hub.leave.domain;

/** HR balance adjustment that would break the balance invariants. */
public class InvalidBalanceAdjustmentException extends BusinessRuleViolationException {

    public InvalidBalanceAdjustmentException(String message) {
        super(null, message);
    }
}
