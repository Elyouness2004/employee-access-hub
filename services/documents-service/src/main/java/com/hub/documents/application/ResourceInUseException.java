package com.hub.documents.application;

/** A resource cannot be deleted while it is still referenced — maps to 409. */
public class ResourceInUseException extends RuntimeException {

    public ResourceInUseException(String message) {
        super(message);
    }
}
