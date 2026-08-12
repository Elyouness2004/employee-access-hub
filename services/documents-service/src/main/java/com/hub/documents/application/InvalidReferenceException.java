package com.hub.documents.application;

/** A request referenced something that does not exist (e.g. category) — 422. */
public class InvalidReferenceException extends RuntimeException {

    public InvalidReferenceException(String message) {
        super(message);
    }
}
