package com.hub.documents.application;

/** An upload carries no bytes — maps to 400, a malformed request rather than a policy refusal. */
public class EmptyUploadException extends RuntimeException {

    public EmptyUploadException(String message) {
        super(message);
    }
}
