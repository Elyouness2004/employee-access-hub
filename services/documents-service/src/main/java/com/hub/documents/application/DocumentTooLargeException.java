package com.hub.documents.application;

/** An upload exceeds the configured ceiling — maps to 413. */
public class DocumentTooLargeException extends RuntimeException {

    public DocumentTooLargeException(long sizeBytes, long maxBytes) {
        super("file is " + sizeBytes + " bytes; the maximum accepted size is " + maxBytes + " bytes");
    }
}
