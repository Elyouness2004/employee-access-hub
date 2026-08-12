package com.hub.documents.application;

import java.io.InputStream;

/**
 * An uploaded file as the application layer sees it — the web layer's
 * {@code MultipartFile} adapted to four plain values, so the use case neither
 * depends on Spring's multipart types nor can be tempted to touch the request.
 * The stream is consumed exactly once, by the blob store.
 */
public record UploadedFile(String originalFilename, String contentType, long sizeBytes, InputStream content) {
}
