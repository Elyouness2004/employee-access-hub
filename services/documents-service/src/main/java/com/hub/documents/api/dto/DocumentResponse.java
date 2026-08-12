package com.hub.documents.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.documents.domain.Document;

public record DocumentResponse(
        UUID id,
        String title,
        String description,
        UUID categoryId,
        String categoryName,
        boolean sensitive,
        UUID ownerKeycloakId,
        String contentType,
        Long sizeBytes,
        String uploadedBy,
        Instant createdAt,
        Instant updatedAt) {

    public static DocumentResponse from(Document document) {
        return new DocumentResponse(
                document.getId(),
                document.getTitle(),
                document.getDescription(),
                document.getCategory().getId(),
                document.getCategory().getName(),
                document.isSensitive(),
                document.getOwnerKeycloakId(),
                document.getContentType(),
                document.getSizeBytes(),
                document.getUploadedBy(),
                document.getCreatedAt(),
                document.getUpdatedAt());
    }
}
