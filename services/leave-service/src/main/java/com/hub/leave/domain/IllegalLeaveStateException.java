package com.hub.leave.domain;

/** Transition not allowed by the state machine (Diagram 19) — maps to 409. */
public class IllegalLeaveStateException extends RuntimeException {

    public IllegalLeaveStateException(LeaveStatus current, String attempted) {
        super("cannot " + attempted + " a request in status " + current);
    }
}
