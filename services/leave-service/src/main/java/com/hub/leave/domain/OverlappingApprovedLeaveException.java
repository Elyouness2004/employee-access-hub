package com.hub.leave.domain;

/** BR-03: a leave period must not overlap already-approved leave. */
public class OverlappingApprovedLeaveException extends BusinessRuleViolationException {

    public OverlappingApprovedLeaveException(DateRange requested, DateRange approved) {
        super("BR-03", "period " + requested + " overlaps approved leave " + approved);
    }
}
