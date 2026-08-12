package com.hub.documents.application;

/** A unique constraint would be violated (e.g. category name) — maps to 409. */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }
}
