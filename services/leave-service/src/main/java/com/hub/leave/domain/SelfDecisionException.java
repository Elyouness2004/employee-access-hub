package com.hub.leave.domain;

/**
 * BR-02: nobody decides their own leave request — not even via the HR
 * escalation path. Final domain invariant behind the routing rules.
 */
public class SelfDecisionException extends BusinessRuleViolationException {

    public SelfDecisionException() {
        super("BR-02", "deciding one's own leave request is not allowed; "
                + "the request must be handled by the manager or escalated to HR");
    }
}
