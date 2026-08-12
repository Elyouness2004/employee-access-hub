package com.hub.leave.domain;

/** General period validation (ordering, empty business days, year span). */
public class InvalidLeavePeriodException extends BusinessRuleViolationException {

    public InvalidLeavePeriodException(String message) {
        super(null, message);
    }
}
