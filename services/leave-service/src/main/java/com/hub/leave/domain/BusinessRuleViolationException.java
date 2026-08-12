package com.hub.leave.domain;

/**
 * A leave business rule rejected the operation — maps to 422. {@code rule}
 * carries the analysis-document code (BR-01…) when one applies, so violations
 * are traceable in responses and audit entries.
 */
public abstract class BusinessRuleViolationException extends RuntimeException {

    private final String rule;

    protected BusinessRuleViolationException(String rule, String message) {
        super(message);
        this.rule = rule;
    }

    /** BR code such as {@code BR-01}, or null for general domain validation. */
    public String getRule() {
        return rule;
    }
}
