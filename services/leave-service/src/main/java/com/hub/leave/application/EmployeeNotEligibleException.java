package com.hub.leave.application;

/**
 * The caller's identity has no ACTIVE employee record in HR — either the
 * identity link is missing (onboarding E04 not run) or the employee is
 * offboarded. Maps to 422: the request is understood but cannot be processed.
 */
public class EmployeeNotEligibleException extends RuntimeException {

    public EmployeeNotEligibleException(String message) {
        super(message);
    }
}
