package com.hub.hr.application;

/**
 * A provisioning operation could not be completed and the state was rolled back
 * to a consistent point (no half-created account). Surfaces as an RFC-7807 502
 * at the API — the request was well-formed but the downstream identity operation
 * failed.
 */
public class ProvisioningException extends RuntimeException {

    public ProvisioningException(String message) {
        super(message);
    }

    public ProvisioningException(String message, Throwable cause) {
        super(message, cause);
    }
}
