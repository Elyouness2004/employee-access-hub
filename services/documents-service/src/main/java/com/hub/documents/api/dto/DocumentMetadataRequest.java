package com.hub.documents.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The descriptive half of a document: the JSON {@code metadata} part of a
 * multipart upload, and the body of a metadata-only edit. It deliberately has no
 * {@code storageKey} — where the bytes live is decided by the blob store, not by
 * the caller. {@code ownerKeycloakId} is optional; omit it for a company-wide
 * document.
 *
 * <p>The pre-existing {@link UploadDocumentRequest} (which does carry a
 * {@code storageKey}) stays as-is for callers registering metadata for a blob
 * written elsewhere.
 */
public record DocumentMetadataRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 500) String description,
        @NotNull UUID categoryId,
        UUID ownerKeycloakId) {
}
