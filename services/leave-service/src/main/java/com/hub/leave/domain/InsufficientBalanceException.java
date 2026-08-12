package com.hub.leave.domain;

/** BR-01: a leave request must not exceed the available balance. */
public class InsufficientBalanceException extends BusinessRuleViolationException {

    public InsufficientBalanceException(int requested, int available) {
        super("BR-01", "requested " + requested + " business day(s) but only "
                + available + " available");
    }
}
