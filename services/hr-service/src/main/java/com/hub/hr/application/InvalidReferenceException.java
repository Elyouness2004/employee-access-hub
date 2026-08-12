package com.hub.hr.application;

/**
 * Request body references an entity that does not exist or is not allowed
 * (e.g. unknown department, self-managing employee) — maps to 422, the
 * project-wide status for business-rule violations.
 */
public class InvalidReferenceException extends RuntimeException {

    public InvalidReferenceException(String message) {
        super(message);
    }
}
