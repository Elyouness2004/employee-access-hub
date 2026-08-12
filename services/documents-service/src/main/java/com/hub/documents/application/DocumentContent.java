package com.hub.documents.application;

import java.io.InputStream;

/**
 * An authorized, audited byte stream ready to be written to the response, with
 * the metadata the HTTP layer needs to describe it. The stream is open: the web
 * layer owns closing it, which it does by handing it to the message converter.
 */
public record DocumentContent(String filename, String contentType, Long sizeBytes, InputStream stream) {
}
