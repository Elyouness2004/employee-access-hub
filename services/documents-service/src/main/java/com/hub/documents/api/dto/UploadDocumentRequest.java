package com.hub.documents.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Document metadata upload (HR). {@code ownerKeycloakId} is optional — omit it
 * for a company-wide document.
 */
public record UploadDocumentRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 500) String description,
        @NotNull UUID categoryId,
        UUID ownerKeycloakId,
        @NotBlank @Size(max = 500) String storageKey,
        @Size(max = 100) String contentType,
        @PositiveOrZero Long sizeBytes) {
}
