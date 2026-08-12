package com.hub.hr.application;

/**
 * The caller asked to terminate the session they are currently using without
 * confirming it. Surfaces as 409 so the current session cannot be ended by
 * accident — the client must retry with explicit confirmation (Part 8
 * acceptance criterion).
 */
public class CurrentSessionConfirmationRequiredException extends RuntimeException {

    public CurrentSessionConfirmationRequiredException(String sessionId) {
        super("session " + sessionId + " is the current session; confirmation is required to terminate it");
    }
}
