package com.hub.leave.domain;

/**
 * State machine (Diagram 19): SUBMITTED is the only state a decision or a
 * cancellation may leave from; APPROVED can still be cancelled by the
 * offboarding signal (BR-05), which re-credits the balance.
 */
public enum LeaveStatus {
    SUBMITTED,
    APPROVED,
    REJECTED,
    CANCELLED
}
