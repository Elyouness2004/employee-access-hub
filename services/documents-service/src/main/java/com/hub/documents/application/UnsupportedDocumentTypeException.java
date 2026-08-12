package com.hub.documents.application;

import java.util.Collection;

/** An upload declares a MIME type outside the allowlist — maps to 415. */
public class UnsupportedDocumentTypeException extends RuntimeException {

    public UnsupportedDocumentTypeException(String contentType, Collection<String> allowed) {
        super("content type " + (contentType == null ? "<missing>" : contentType)
                + " is not accepted; allowed types are " + String.join(", ", allowed));
    }
}
