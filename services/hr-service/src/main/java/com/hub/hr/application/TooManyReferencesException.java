package com.hub.hr.application;

/** A batch lookup asked for more references than one request may carry. */
public class TooManyReferencesException extends RuntimeException {

    public TooManyReferencesException(String message) {
        super(message);
    }
}
