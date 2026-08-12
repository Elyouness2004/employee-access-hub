package com.hub.expense.domain;

/**
 * BR-02: nobody decides their own expense claim — not even via the HR
 * escalation path. Final domain invariant behind the routing rules.
 */
public class SelfDecisionException extends BusinessRuleViolationException {

    public SelfDecisionException() {
        super("BR-02", "deciding one's own expense claim is not allowed; "
                + "it must be handled by the manager or escalated to HR");
    }
}
