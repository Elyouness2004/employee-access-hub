package com.hub.documents.domain.storage;

/**
 * The blob store could not be reached or used. Surfaces as {@code 503} — an
 * infrastructure outage the caller should retry, deliberately distinct from a
 * document that simply has no bytes stored (a {@code 404} on the content
 * sub-resource), which is not an error condition of the store.
 */
public class DocumentStorageException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DocumentStorageException(String message) {
        super(message);
    }

    public DocumentStorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
