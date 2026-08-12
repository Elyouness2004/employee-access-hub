package com.hub.hr.domain.identity;

/**
 * The identity provider could not be reached or refused an admin operation.
 * Surfaces as 503 at the API — distinct from a provisioning logic failure.
 */
public class IdentityUnavailableException extends RuntimeException {

    public IdentityUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public IdentityUnavailableException(String message) {
        super(message);
    }
}
