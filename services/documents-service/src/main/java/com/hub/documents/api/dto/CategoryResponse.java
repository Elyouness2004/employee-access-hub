package com.hub.documents.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.documents.domain.AccessRole;
import com.hub.documents.domain.DocumentCategory;

public record CategoryResponse(
        UUID id,
        String name,
        String description,
        AccessRole minRole,
        boolean sensitive,
        Instant createdAt,
        Instant updatedAt) {

    public static CategoryResponse from(DocumentCategory category) {
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getDescription(),
                category.getMinRole(),
                category.isSensitive(),
                category.getCreatedAt(),
                category.getUpdatedAt());
    }
}
