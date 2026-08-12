package com.hub.documents.api.dto;

import java.util.UUID;

import com.hub.documents.domain.Document;

/**
 * Download reference (metadata service holds no bytes): the storage key is the
 * pointer the caller resolves against the blob store. Returning it is the point
 * at which the download is audit-logged (FR-41).
 */
public record DocumentDownloadResponse(
        UUID id,
        String title,
        String storageKey,
        String contentType,
        Long sizeBytes) {

    public static DocumentDownloadResponse from(Document document) {
        return new DocumentDownloadResponse(
                document.getId(),
                document.getTitle(),
                document.getStorageKey(),
                document.getContentType(),
                document.getSizeBytes());
    }
}
