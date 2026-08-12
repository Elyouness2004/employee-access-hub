package com.hub.hr.application;

/** Resource is still referenced by others and cannot be deleted — maps to 409. */
public class ResourceInUseException extends RuntimeException {

    public ResourceInUseException(String message) {
        super(message);
    }
}
